import moment from "moment";
import Record from "../models/Record";
import User from "../models/User";
import Matching from "../models/Matching";

const getRecords = async (userId, keyword, coordinate) => {
  const {coupleId} = await User.findOne({userId});
  
  console.log(`유저: ${userId}, 커플: ${coupleId || '없음'}`);
  
  let andList = [];
  let userList = [{userId}];
  coupleId && userList.push({userId: coupleId});
  andList.push({$or: userList});
  
  if (keyword) {
    const likeQuery = new RegExp(keyword);
    
    andList.push({
      $or: [
        {placeName: likeQuery},
        {menus: likeQuery},
        {category: likeQuery},
        {address: likeQuery}
      ]
    });
    console.log(`검색어: ${keyword}`);
  }
  
  if (coordinate) {
    const {xMin, xMax, yMin, yMax} = coordinate;
    andList.push({x: {$gte: xMin, $lte: xMax}});
    andList.push({y: {$gte: yMin, $lte: yMax}});
    console.log(`좌표: ${xMin}, ${xMax}, ${yMin}, ${yMax}`);
  }
  
  // {
  //   $and: [
  //     {$or: [{userId: userId, userId: coupleId}]},
  //     {$or: [{placeName: /keyword/}, {menus: /keyword/}, {category: /keyword/}, {address: /keyword/}]},
  //     {x: {$gte: xMin, $lte: xMax}},
  //     {y: {$gte: yMin, $lte: yMax}}
  //   ]
  // }
  const pipelineList = [{$match: {$and: andList}}];
  pipelineList.push(coordinate ?
    {
      $group: {
        _id: '$placeId',
        count: {$sum: 1},
        category: {$first: '$category'},
        placeName: {$first: '$placeName'},
        url: {$first: '$url'},
        x: {$first: '$x'},
        y: {$first: '$y'}
      }
    }
    :
    {$sort: {visitedDate: -1, created: -1}}
  );
  
  return await Record.aggregate(pipelineList);
};

export default {
  Query: {
    async records(_, {userId, keyword, cursor = 1, pageSize = 10}) {
      const allRecords = await getRecords(userId, keyword);
      
      console.log(`페이지: ${cursor}`);
      
      const nextSize = pageSize * cursor;
      const pagedRecords = allRecords.slice(0, nextSize);
      const records = [];
      pagedRecords.reduce((prev, curr) => {
        records.push({
          ...curr,
          changedYear: prev.visitedYear !== curr.visitedYear ? curr.visitedYear : 0,
          changedMonth: prev.visitedMonth !== curr.visitedMonth ? curr.visitedMonth : 0
        });
        
        return curr;
      }, {
        visitedYear: pagedRecords[0].visitedYear,
        visitedMonth: 0
      });
      
      return {
        cursor: cursor + 1,
        hasMore: allRecords.length > nextSize,
        records
      };
    },
    async mapRecords(_, {userId, xMin, xMax, yMin, yMax, keyword}) {
      return await getRecords(userId, keyword, {xMin, xMax, yMin, yMax});
    },
    async countedRecords(_, {userId}) {
      const {coupleId} = await User.findOne({userId});
      
      return await Record.aggregate([
        {
          $match: {
            $and: [{category: /음식점/}, {$or: coupleId ? [{userId}, {userId: coupleId}] : [{userId}]}]
          }
        }, {
          $group: {
            _id: '$placeId',
            count: {$sum: 1},
            placeName: {$first: '$placeName'},
            url: {$first: '$url'},
            x: {$first: '$x'},
            y: {$first: '$y'}
          }
        }, {
          $sort: {count: -1}
        }
      ]);
    },
    async spending(_, {userId, now}) {
      const {coupleId} = await User.findOne({userId});
      
      let where = {$or: coupleId ? [{userId}, {userId: coupleId}] : [{userId}]};
      if (now) {
        where.visitedDate = {
          $gte: moment(now).startOf('month'),
          $lte: moment(now).endOf('month')
        };
      }
      
      const records = await Record.find(where);
      const total = records.reduce((sum, {money}) => sum + money, 0);
      
      where.isDutch = true;
      const dutchRecords = await Record.find(where);
      const dutch = dutchRecords.reduce((sum, {money}) => sum + money, 0) / 2;
      
      console.log(`${userId}: ${total}`);
      
      return {
        total,
        dutch
      }
    },
    async users(_, {keyword = ''}) {
      return keyword ? await User.find({nickname: new RegExp(keyword)}).sort({nickname: 1}) : [];
    },
    async receivedAlarms(_, {targetId}) {
      return await Matching.find({completed: false, targetId}).sort({created: -1});
    },
    async requestedAlarms(_, {applicantId, alarm}) {
      return await Matching.find({alarm, applicantId}).sort({created: -1});
    },
    async myLover(_, {myId: userId}) {
      const {coupleId} = await User.findOne({userId});
      if (!coupleId) {
        return null;
      }
      
      const {nickname} = await User.findOne({userId: coupleId});
      return {nickname};
    }
  },
  Mutation: {
    async createRecord(_, {input}) {
      const {_id} = input;
      
      console.log(_id ? `${_id} 기록 수정 =>` : `새로운 기록 =>`, input);
      
      try {
        _id ? await Record.updateOne({_id}, {$set: input}) : await Record.create(input);
        return true;
      } catch (error) {
        console.error(error);
        return false;
      }
    },
    async createUser(_, {userId, nickname}) {
      console.log(`${userId} (${nickname})`);
      
      try {
        const found = await User.find({userId});
        await !found.length && User.create({userId, nickname});
        
        return true;
      } catch (error) {
        console.error(error);
        return false;
      }
    },
    async requestMatching(_, {applicantId, applicantName, targetId, targetName, type}) {
      console.log(`${applicantId}가 ${targetId}에게 요청`);
      
      try {
        await Matching.create({applicantId, applicantName, targetId, targetName, type});
        return true;
      } catch (error) {
        console.error(error);
        return false;
      }
    },
    async decideAlarm(_, {_id, result, type, myId, applicantId}) {
      console.log(`${_id} 알림 ${result} 처리`);
      
      try {
        await Matching.findOneAndUpdate({_id}, {$set: {result, completed: true, alarm: true}});
        if (result === 'rejected') {
          return true;
        }
        
        await User.findOneAndUpdate({userId: myId},
          type === 'couple' ?
            {$set: {coupleId: applicantId}}
            :
            {$addToSet: {friends: applicantId}}
        );
        await User.findOneAndUpdate({userId: applicantId},
          type === 'couple' ?
            {$set: {coupleId: myId}}
            :
            {$addToSet: {friends: myId}});
        
        return true;
      } catch (error) {
        console.error(error);
        return false;
      }
    },
    async offAlarm(_, {_id}) {
      console.log(`${_id} 알림 끄기`);
      
      try {
        await Matching.findOneAndUpdate({_id}, {$set: {alarm: false}});
        return true;
      } catch (error) {
        console.error(error);
        return false;
      }
    },
    async deleteRecord(_, {_id}) {
      console.log(`${_id} 기록 삭제`);
      
      try {
        await Record.remove({_id});
        return true;
      } catch (error) {
        console.error(error);
        return false;
      }
    }
  }
};

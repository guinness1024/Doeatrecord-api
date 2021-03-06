import User from "../models/User";

export default {
  Query: {
    async user(_, {userId}) {
      return User.findOne({userId});
    },
    async users(_, {userId = '', keyword = ''}) {
      return User
        .find({nickname: new RegExp(keyword), userId})
        .sort({nickname: 1});
    },
    async myLover(_, {userId}) {
      const {coupleId} = await User.findOne({userId});
      if (!coupleId) {
        return null;
      }
      
      return User.findOne({userId: coupleId});
    },
    async unMatchedUsers(_, {userId, keyword = '', type}) {
      const {coupleId, friends = []} = await User.findOne({userId});
      let excludeList = friends.concat(userId);
      coupleId && excludeList.push(coupleId);
      
      if (!keyword) {
        return [];
      }
      
      return User
        .find({
          $or: [{userId: new RegExp(keyword)}, {nickname: new RegExp(keyword)}],
          userId: {$nin: excludeList},
          ...(type === 'couple' ? {coupleId: ''} : {}),
        })
        .sort({nickname: 1});
    },
  },
  Mutation: {
    async createUser(_, {userId, nickname}) {
      try {
        const found = await User.find({userId});
        !found.length && await User.create({userId, nickname});
        
        return true;
      } catch (error) {
        return false;
      }
    },
    async unFollow(_, {userId, friendId}) {
      try {
        await User.findOneAndUpdate({userId}, {$pull: {friends: friendId}});
        await User.findOneAndUpdate({userId: friendId}, {$pull: {friends: userId}});
        
        return true;
      } catch (error) {
        return false;
      }
    },
    async breakUp(_, {userId, coupleId}) {
      try {
        await User.findOneAndUpdate({userId}, {$set: {coupleId: ''}});
        await User.findOneAndUpdate({userId: coupleId}, {$set: {coupleId: ''}});
        
        return true;
      } catch (error) {
        return false;
      }
    },
  }
};

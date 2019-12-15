import User from "../models/User";

export default {
  Query: {
    async user(_, {userId}) {
      return await User.findOne({userId})
    },
    async users(_, {keyword = ''}) {
      return keyword ? await User.find({nickname: new RegExp(keyword)}).sort({nickname: 1}) : [];
    },
    async myLover(_, {myId: userId}) {
      const {coupleId} = await User.findOne({userId});
      if (!coupleId) {
        return null;
      }
      
      const {nickname} = await User.findOne({userId: coupleId});
      return {nickname};
    },
    async myFriends(_, {userId}) {
      const {friends} = await User.findOne({userId});
      return await friends.map(async friend => {
        return await User.findOne({userId: friend});
      });
    }
  },
  Mutation: {
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
  }
};
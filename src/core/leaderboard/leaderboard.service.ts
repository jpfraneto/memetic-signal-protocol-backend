import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { User } from '../../models/User/User.model';
import { GetLeaderboardDto } from './dto/get-leaderboard.dto';

@Injectable()
export class LeaderboardService {
  private readonly logger = new Logger(LeaderboardService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async getLeaderboard(query: GetLeaderboardDto): Promise<any> {
    try {
      const queryBuilder = this.userRepository
        .createQueryBuilder('user')
        .where('user.settledCalls >= :minCalls', {
          minCalls: query.minSettledCalls,
        })
        .orderBy('user.mfsScore', 'DESC')
        .addOrderBy('user.winRate', 'DESC')
        .addOrderBy('user.settledCalls', 'DESC');

      // Pagination
      const skip = (query.page - 1) * query.limit;
      queryBuilder.skip(skip).take(query.limit);

      const [users, total] = await queryBuilder.getManyAndCount();

      // Calculate ranks
      const usersWithRanks = users.map((user, index) => ({
        fid: user.fid,
        username: user.username,
        displayName: user.displayName,
        pfpUrl: user.pfpUrl,
        isVerified: user.isVerified,
        totalSignals: user.totalSignals,
        activeSignals: user.activeSignals,
        settledSignals: user.settledSignals,
        winRate: parseFloat(user.winRate.toString()),
        mfsScore: parseFloat(user.mfsScore.toString()),
        rank: skip + index + 1,
      }));

      return {
        users: usersWithRanks,
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          pages: Math.ceil(total / query.limit),
        },
      };
    } catch (error) {
      this.logger.error('Error fetching leaderboard:', error);
      throw error;
    }
  }

  async getLeaderboardStats(): Promise<any> {
    try {
      // Get total users
      const totalUsers = await this.userRepository.count();

      // Get qualified users (minimum settled calls) 
      const qualifiedUsers = await this.userRepository
        .createQueryBuilder('user')
        .where('user.settledCalls >= 5')
        .getCount();

      // Get aggregate stats
      const result = await this.userRepository
        .createQueryBuilder('user')
        .select([
          'COUNT(user.fid) as totalUsers',
          'SUM(user.totalCalls) as totalCalls',
          'AVG(CASE WHEN user.settledCalls >= 5 THEN user.winRate ELSE NULL END) as avgWinRate',
          'MAX(user.mfsScore) as topMfsScore',
        ])
        .getRawOne();

      return {
        totalUsers,
        qualifiedUsers,
        totalCalls: parseInt(result.totalCalls) || 0,
        avgWinRate: parseFloat(result.avgWinRate) || 0,
        topMfsScore: parseFloat(result.topMfsScore) || 0,
      };
    } catch (error) {
      this.logger.error('Error fetching leaderboard stats:', error);
      throw error;
    }
  }

  async updateUserRanks(): Promise<void> {
    try {
      // Get all qualified users ordered by MFS score
      const users = await this.userRepository
        .createQueryBuilder('user')
        .where('user.settledCalls >= 5')
        .orderBy('user.mfsScore', 'DESC')
        .addOrderBy('user.winRate', 'DESC')
        .addOrderBy('user.settledCalls', 'DESC')
        .getMany();

      // Update ranks
      for (let i = 0; i < users.length; i++) {
        const user = users[i];
        user.rank = i + 1;
      }

      // Batch update
      if (users.length > 0) {
        await this.userRepository.save(users);
      }

      // Clear ranks for unqualified users
      await this.userRepository
        .createQueryBuilder()
        .update(User)
        .set({ rank: null })
        .where('settledCalls < 5')
        .execute();

      this.logger.log(`Updated ranks for ${users.length} qualified users`);
    } catch (error) {
      this.logger.error('Error updating user ranks:', error);
      throw error;
    }
  }
}

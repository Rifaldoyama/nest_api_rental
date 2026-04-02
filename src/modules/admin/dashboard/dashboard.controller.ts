import { Controller, Get, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from 'src/common/guards/jwt.guard';
import { RolesGuard } from 'src/common/guards/role.guard';
import { Roles } from '../../../common/decorators/roles.decorator';

@Controller('admin/dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  async getStats() {
    return this.dashboardService.getDashboardStats();
  }

  @Get('activity')
  async getActivity() {
    return this.dashboardService.getActivityData();
  }

  @Get('transactions')
  async getRecentTransactions() {
    return this.dashboardService.getRecentTransactions();
  }

  @Get('popular-items')
  async getPopularItems() {
    return this.dashboardService.getPopularItems();
  }

  @Get('all')
  async getDashboardData() {
    const [stats, activity, transactions, popularItems] = await Promise.all([
      this.dashboardService.getDashboardStats(),
      this.dashboardService.getActivityData(),
      this.dashboardService.getRecentTransactions(),
      this.dashboardService.getPopularItems(),
    ]);

    return {
      stats,
      activity,
      transactions,
      popularItems,
    };
  }
}
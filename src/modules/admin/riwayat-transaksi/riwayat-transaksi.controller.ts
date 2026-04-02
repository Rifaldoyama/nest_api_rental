import { Controller, Get, Query, Param, UseGuards, Res } from '@nestjs/common';
import { RiwayatTransaksiService } from './riwayat-transaksi.service';
import { JwtAuthGuard } from 'src/common/guards/jwt.guard';
import { RolesGuard } from 'src/common/guards/role.guard';
import { Roles } from '../../../common/decorators/roles.decorator';

@Controller('admin/riwayat-transaksi')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class RiwayatTransaksiController {
  constructor(private readonly riwayatService: RiwayatTransaksiService) {}

  @Get()
  async getAllTransactions(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('search') search?: string,
  ) {
    return this.riwayatService.getAllTransactions({
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 10,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      status,
      type,
      search,
    });
  }

  @Get('stats')
  async getStats() {
    return this.riwayatService.getTransactionStats();
  }

  @Get('logs')
  async getLogs(@Query('limit') limit?: string) {
    return this.riwayatService.getActivityLogs(limit ? parseInt(limit) : 50);
  }

  @Get(':id')
  async getTransactionDetail(@Param('id') id: string) {
    return this.riwayatService.getTransactionDetail(id);
  }

  @Get('export/excel')
  async exportExcel(@Res({ passthrough: true }) res: any, @Query() query: any) {
    const workbook = await this.riwayatService.exportTransactionsExcel(query);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );

    res.setHeader(
      'Content-Disposition',
      'attachment; filename=transactions.xlsx',
    );

    await workbook.xlsx.write(res);
  }
}

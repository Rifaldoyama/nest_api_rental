import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  Query,
  Param,
} from '@nestjs/common';
import { VerifyUserService  } from './verify.service'
import { JwtAuthGuard } from 'src/common/guards/jwt.guard';
import { RolesGuard } from 'src/common/guards/role.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role, VerificationStatus } from '@prisma/client';

@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class VerifyUserController {
  constructor(private readonly verifyUserService: VerifyUserService) {}

  @Get()
  getAllUsers(@Query('status') status: VerificationStatus) {
    return this.verifyUserService.getUsers(status);
  }

  @Get(':id')
  getDetail(@Param('id') id: string) {
    return this.verifyUserService.getUserDetail(id);
  }

  @Patch('action')
  handleVerification(@Body() dto: { userId: string, status: VerificationStatus }) {
    return this.verifyUserService.verifyUser(dto.userId, dto.status);
  }
}

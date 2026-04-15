import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { CekUserService } from './cek.service';
import { JwtAuthGuard } from 'src/common/guards/jwt.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';

@Controller('users')
export class CekUserController {
  constructor(private readonly userService: CekUserService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getMe(@CurrentUser() user: { userId: string; role: string }) {
    const dbUser = await this.userService.getUserById(user.userId);
    const isComplete = await this.userService.isUserDataComplete(user.userId);

    return { user: dbUser, isComplete, need_profile: !isComplete };
  }

  @Get('me/verification-status')
  @UseGuards(JwtAuthGuard)
  getMyVerification(@CurrentUser() user: { userId: string }) {
    return this.userService.getMyVerificationStatus(user.userId);
  }

  @Get('me/detail')
  @UseGuards(JwtAuthGuard)
  async getMyDetail(@CurrentUser() user: { userId: string }) {
    const userDetail = await this.userService.getUserDetail(user.userId);
    return { detail: userDetail };
  }
}

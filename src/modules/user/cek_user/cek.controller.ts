import { Controller, Get, UseGuards } from '@nestjs/common';
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

    return { user: dbUser, isComplete };
  }
}

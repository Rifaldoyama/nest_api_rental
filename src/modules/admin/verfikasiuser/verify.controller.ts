// import {
//   Controller,
//   Get,
//   Patch,
//   Body,
//   UseGuards,
// } from '@nestjs/common';
// import { VerifyUserService  } from './verify.service'
// import { VerifyDto } from './dto/verify.dto';
// import { JwtAuthGuard } from 'src/common/guards/jwt.guard';
// import { RolesGuard } from 'src/common/guards/role.guard';
// import { Roles } from 'src/common/decorators/roles.decorator';
// import { Role } from '@prisma/client';

// @Controller('admin/users')
// @UseGuards(JwtAuthGuard, RolesGuard)
// @Roles(Role.ADMIN)
// export class VerifyUserController {
//   constructor(private readonly verifyUserService : VerifyUserService ) {}

//   @Get('verification')
//   getUsersForVerification() {
//     return this.verifyUserService .getUsersForVerification();
//   }

//   @Patch('verify')
//   verifyUser(@Body() dto: VerifyDto) {
//     return this.verifyUserService .verifyUser(dto.userId);
//   }
// }

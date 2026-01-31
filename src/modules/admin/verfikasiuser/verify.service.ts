// import {
//   Injectable,
//   BadRequestException,
// } from '@nestjs/common';
// import { PrismaService } from 'prisma/prisma.service';
// import { Role } from '@prisma/client';

// @Injectable()
// export class VerifyUserService {
//   constructor(private prisma: PrismaService) {}

//   async verifyUser(userId: string) {
//     const user = await this.prisma.user.findUnique({
//       where: { id: userId },
//     });

//     if (!user) throw new BadRequestException('User not found');

//     if (!user.data_lengkap)
//       throw new BadRequestException('User data not completed');

//     if (user.is_verified)
//       throw new BadRequestException('User already verified');

//     return this.prisma.user.update({
//       where: { id: userId },
//       data: {
//         is_verified: true,
//       },
//     });
//   }

//   async getUsersForVerification() {
//     return this.prisma.user.findMany({
//       where: {
//         data_lengkap: true,
//         is_verified: false,
//         role: Role.USER,
//       },
//       select: {
//         id: true,
//         username: true,
//         email: true,
//         createdAt: true,
//       },
//     });
//   }
// }

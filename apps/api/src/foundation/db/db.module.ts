import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service.js";

/** Global DB module — PrismaService is injectable by every unit repository. */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class DbModule {}

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { getModelForClass } from '@typegoose/typegoose';
import { TaskDispatch } from './entities/task-dispatch.entity';
import { DispatchService } from './dispatch.service';
import { DispatchController } from './dispatch.controller';
import { DispatchSseController } from './dispatch-sse.controller';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: TaskDispatch.name,
        schema: getModelForClass(TaskDispatch).schema,
      },
    ]),
    TenantModule,
  ],
  providers: [DispatchService],
  controllers: [DispatchController, DispatchSseController],
  exports: [DispatchService],
})
export class DispatchModule {}

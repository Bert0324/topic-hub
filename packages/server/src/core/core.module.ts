import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { getModelForClass } from '@typegoose/typegoose';
import { Topic } from './entities/topic.entity';
import { TimelineEntry } from './entities/timeline-entry.entity';
import { TopicService } from './services/topic.service';
import { TimelineService } from './services/timeline.service';
import { TopicDetailController } from './topic-detail.controller';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Topic.name,
        schema: getModelForClass(Topic).schema,
      },
      {
        name: TimelineEntry.name,
        schema: getModelForClass(TimelineEntry).schema,
      },
    ]),
    TenantModule,
  ],
  controllers: [TopicDetailController],
  providers: [TopicService, TimelineService],
  exports: [TopicService, TimelineService],
})
export class CoreModule {}

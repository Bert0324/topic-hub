import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { getModelForClass } from '@typegoose/typegoose';
import { Topic } from '../core/entities/topic.entity';
import { TenantModule } from '../tenant/tenant.module';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Topic.name,
        schema: getModelForClass(Topic).schema,
      },
    ]),
    TenantModule,
  ],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}

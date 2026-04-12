# Quickstart: @topichub/core

## Installation

```bash
npm install @topichub/core
```

## Basic Usage (Embedded in External Project)

```typescript
import mongoose from 'mongoose';
import { TopicHub } from '@topichub/core';

// 1. Use your existing MongoDB connection
const connection = mongoose.createConnection('mongodb://localhost:27017/myapp');

// 2. Create a TopicHub instance
const hub = await TopicHub.create({
  mongoConnection: connection,
  skillsDir: './topichub-skills',
  ai: {
    provider: 'ark',
    apiKey: process.env.AI_API_KEY!,
  },
});

// 3. Use the API
const { topic, created } = await hub.ingestion.ingest('tenant-123', {
  type: 'bug',
  title: 'Login page broken',
  tags: ['critical'],
  assignees: ['user-456'],
});

const result = await hub.topics.list('tenant-123', { status: 'open' });

// 4. Handle webhooks from IM platforms
// In your HTTP framework's route handler:
app.post('/webhooks/:platform', async (req, res) => {
  const result = await hub.webhook.handle(
    req.params.platform,
    req.body,
    req.headers,
  );
  res.json(result);
});

// 5. Send messages to IM platforms
await hub.messaging.send('discord', {
  tenantId: 'tenant-123',
  groupId: 'channel-789',
  message: 'Topic resolved: Login page broken',
});

// 6. Cleanup on shutdown
await hub.shutdown();
```

## Standalone Usage (with MongoDB URI)

```typescript
import { TopicHub } from '@topichub/core';

const hub = await TopicHub.create({
  mongoUri: 'mongodb://localhost:27017/topichub',
  skillsDir: './skills',
});

// TopicHub manages the connection lifecycle
// ...use hub APIs...

await hub.shutdown(); // disconnects from MongoDB
```

## Integration with Gulux (experience_server example)

```typescript
// service/topichub.ts
import { Injectable } from '@gulux/gulux';
import { TopicHub } from '@topichub/core';

@Injectable()
export class TopicHubService {
  private hub: TopicHub;

  async onReady() {
    this.hub = await TopicHub.create({
      mongoConnection: existingMongooseConnection,
      skillsDir: './topichub-skills',
      ai: { provider: 'ark', apiKey: process.env.AI_API_KEY! },
    });
  }

  getHub() { return this.hub; }
}

// controller/topichub.controller.ts
import { Controller, Post, Get, Body, Query, Param, Res } from '@gulux/gulux/application-http';
import { TopicHubService } from '../service/topichub';

@Controller({ path: '/topichub' })
export default class TopicHubController {
  constructor(private readonly topicHubService: TopicHubService) {}

  @Post('/events')
  async ingestEvent(@Body() body: any, @Res() res: any) {
    const hub = this.topicHubService.getHub();
    res.body = await hub.ingestion.ingest(body.tenantId, body);
  }

  @Post('/commands')
  async executeCommand(@Body() body: any, @Res() res: any) {
    const hub = this.topicHubService.getHub();
    res.body = await hub.commands.execute(body.tenantId, body.command, {
      platform: body.platform,
      groupId: body.groupId,
      userId: body.userId,
    });
  }

  @Post('/webhooks/:platform')
  async handleWebhook(@Param('platform') platform: string, @Body() body: any, @Res() res: any) {
    const hub = this.topicHubService.getHub();
    res.body = await hub.webhook.handle(platform, body, {});
  }

  @Get('/topics')
  async listTopics(@Query() query: any, @Res() res: any) {
    const hub = this.topicHubService.getHub();
    res.body = await hub.topics.list(query.tenantId, query);
  }
}
```

## CLI Connection to Embedded Deployment

```bash
topichub-admin init
# When prompted for server URL, enter the full base path:
# http://host:8080/api/experience/topichub
# The CLI will verify by calling http://host:8080/api/experience/topichub/health
```

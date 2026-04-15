/**
 * All persistence models TopicHub expects, built on the host stack (e.g. GuluX typegoose + ByteDoc).
 * Collection names must already include {@link TopicHubConfig.collectionPrefix}.
 *
 * Fields are intentionally untyped (`any`) so hosts using a mongoose-compatible driver
 * (e.g. `@byted/bytedmongoose`) are not blocked by duplicate `mongoose` package typings.
 */
export interface TopicHubMongoModels {
  TopicModel: any;
  TimelineEntryModel: any;
  SkillRegistrationModel: any;
  TaskDispatchModel: any;
  UserIdentityBindingModel: any;
  PairingCodeModel: any;
  ExecutorHeartbeatModel: any;
  QaExchangeModel: any;
  IdentityModel: any;
  ImIdentityLinkModel: any;
  ExecutorRegistrationModel: any;
  ImBindingModel: any;
  SkillLikeModel: any;
  SkillUsageModel: any;
  /** Embedded OpenClaw follower → leader `message` tool sends (collection `${prefix}openclaw_send_queue`). */
  OpenClawSendQueueModel: any;
}

/**
 * Host-injected persistence: same connection used for embedded bridge lease + pre-built models.
 * Core does not open Mongo or call `getModelForClass` when this is set.
 */
export interface TopicHubMongoAdapter {
  /** Mongoose `Connection` (or compatible) used by bridge lease and services. */
  connection: any;
  models: TopicHubMongoModels;
  /**
   * When `true`, {@link TopicHub.shutdown} will `connection.close()`.
   * Host-owned pools should leave this `false` (default).
   */
  ownsConnection?: boolean;
}

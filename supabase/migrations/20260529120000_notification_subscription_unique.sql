-- Allow upsert on notification_subscription by endpoint per user
alter table notification_subscription
  add constraint notification_subscription_user_endpoint_unique
  unique (user_id, endpoint);

-- WebriQ Central Hub — Sprint 6 KB Seed: Content Update + Settings Change playbooks
-- Global playbooks (customer_id = null) — manual source, active

insert into playbooks (customer_id, task_type, title, content, version, status, source)
values
(
  null,
  'CONTENT_UPDATE',
  'Content Update Playbook',
  E'# Content Update Playbook\n\n'
  '## When to use\nUse for any request that modifies copy, images, or structured content in Sanity CMS without changing site structure or code.\n\n'
  '## Steps\n'
  '1. Confirm the exact pages or content blocks to be updated with the PM.\n'
  '2. Pull the latest content from Sanity for the target dataset.\n'
  '3. Apply changes in the Sanity Studio or via the Content Lake API.\n'
  '4. Preview changes in the Sanity Preview URL if available.\n'
  '5. Publish the document in Sanity Studio.\n'
  '6. Verify on the live site within 5 minutes (CDN propagation).\n'
  '7. Close the Zoho task and add a comment with the Sanity document ID and the change summary.\n\n'
  '## Common errors\n'
  '- **Publish blocked:** Another draft is locked — discard or merge the conflicting draft first.\n'
  '- **Image not appearing:** Check the asset pipeline is not filtered by locale or device type.\n\n'
  '## Acceptance criteria\n'
  '- Content visible on production URL within 10 minutes of publish.\n'
  '- No console errors on the updated page.',
  1,
  'ACTIVE',
  'manual'
),
(
  null,
  'SETTINGS_CHANGE',
  'Settings Change Playbook',
  E'# Settings Change Playbook\n\n'
  '## When to use\nUse for any request that modifies environment variables, feature flags, third-party integration credentials, or CMS global settings without deploying new code.\n\n'
  '## Steps\n'
  '1. Identify the setting key and target environment (staging vs production).\n'
  '2. Record the current value in the Zoho task notes as a rollback reference.\n'
  '3. Apply the change:\n'
  '   - For Vercel env vars: update via Vercel Dashboard → Project Settings → Environment Variables.\n'
  '   - For Sanity global config: update via the Settings singleton document in Sanity Studio.\n'
  '   - For Zoho settings: update via Zoho portal configuration.\n'
  '4. Trigger a redeployment if the env var is build-time (not runtime).\n'
  '5. Smoke-test the affected feature on the target environment.\n'
  '6. Close the Zoho task with before/after values documented in the comment.\n\n'
  '## Rollback\n'
  'Revert to the recorded value from step 2. Redeploy if necessary.\n\n'
  '## Acceptance criteria\n'
  '- The affected feature behaves as expected with the new setting.\n'
  '- No regression in related features.',
  1,
  'ACTIVE',
  'manual'
)
on conflict do nothing;

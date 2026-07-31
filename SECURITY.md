# LifeTag Security

Do not report vulnerabilities through public issues when they may expose personal or medical information. Contact the repository owner privately and include only synthetic test data.

Never commit Supabase secret or service-role keys, database passwords, notification-provider credentials, exported LifeTag backups, or real health documents. The browser may use only a Supabase publishable key with Row Level Security enabled.

Before production use, verify account isolation with two independent test accounts, review Supabase Security Advisor findings, configure storage backups, and complete the privacy and regulatory review applicable to the deployment region.

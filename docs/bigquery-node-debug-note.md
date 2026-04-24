# BigQuery Node Debug Note

## Context

This note summarizes how the current project initializes the BigQuery client, the local environment configuration, and the timeout failures observed while debugging `On-chain Board` fund-flow loading.

## Current Node.js BigQuery Initialization

File:

- [server/liveData.ts](/Users/mmobay202303/Desktop/vibe%20coding/crypto%20ai/crypto_exchange_dashboard/server/liveData.ts)

Current initialization logic:

```ts
import { BigQuery } from "@google-cloud/bigquery";

let bigQueryClient: BigQuery | null = null;

function getBigQueryClient() {
  if (bigQueryClient) return bigQueryClient;

  const projectId = process.env.BIGQUERY_PROJECT_ID;
  const keyFilename = process.env.BIGQUERY_CREDENTIALS_PATH;
  const credentialsJson =
    process.env.BIGQUERY_CREDENTIALS_JSON ??
    process.env.GOOGLE_CREDENTIALS_JSON ??
    process.env.GCP_SERVICE_ACCOUNT_JSON ??
    null;

  if (!projectId || (!keyFilename && !credentialsJson)) {
    throw new Error(
      "BIGQUERY_PROJECT_ID and either BIGQUERY_CREDENTIALS_PATH or BIGQUERY_CREDENTIALS_JSON must be configured"
    );
  }

  if (credentialsJson) {
    const credentials = JSON.parse(credentialsJson);
    bigQueryClient = new BigQuery({
      projectId,
      credentials,
    });
  } else {
    bigQueryClient = new BigQuery({
      projectId,
      keyFilename,
    });
  }

  return bigQueryClient;
}
```

## Local `.env` Used During Debugging

```env
DATABASE_URL="mysql://observer:observer01234TapFy@34.69.208.251:8876/cryptoaivipdb?charset=utf8mb4"
FEATURE_DATABASE_URL="mysql://app:StrongPass_123%21@34.69.208.251:8336/frontend_feature_db?charset=utf8mb4"
OAUTH_SERVER_URL="http://34.88.6.200:8233/api"
BIGQUERY_PROJECT_ID="online-stars"
BIGQUERY_DATASET="chaindata_cryptoai"
BIGQUERY_CREDENTIALS_PATH="/Users/mmobay202303/bq_sa.json"
CMC_API_KEY="1170edcb-f0ec-4908-83db-a13d7790737a"
```

## BigQuery Tables Accessed by On-chain Logic

- `online-stars.chaindata_cryptoai.token_transfer_raw`
- `online-stars.chaindata_cryptoai.token_holder_snapshot`
- `online-stars.chaindata_cryptoai.token_dex_action_raw`
- `online-stars.chaindata_cryptoai.wallet_info`

## Minimal Node Query Tested

```js
const { BigQuery } = require("@google-cloud/bigquery");

const client = new BigQuery({
  projectId: process.env.BIGQUERY_PROJECT_ID,
  keyFilename: process.env.BIGQUERY_CREDENTIALS_PATH,
});

const query = "SELECT * FROM `online-stars.chaindata_cryptoai.token_dex_action_raw` LIMIT 3";
```

Observed result:

```json
{
  "ok": false,
  "elapsedMs": 14998,
  "error": "timeout after 15000ms"
}
```

## Token-ID Query Tested

```sql
SELECT token_id, token_address, from_address, to_address, amount, block_time
FROM `online-stars.chaindata_cryptoai.token_transfer_raw`
WHERE token_id = 787
LIMIT 3
```

Observed result:

```json
{
  "ok": false,
  "elapsedMs": 15000,
  "error": "timeout after 15000ms"
}
```

## Project Fund-flow Function Tested

Function:

```ts
getOnchainFundFlowBySymbol("BSB", { depth: 4, limitPerLayer: 36 })
```

Observed result:

```json
{
  "ok": false,
  "elapsedMs": 15002,
  "error": "timeout after 15000ms"
}
```

## JSON Credentials Injection Test

Tested alternative client initialization:

```ts
const credentials = JSON.parse(credentialsJson);

const client = new BigQuery({
  projectId,
  credentials,
});
```

Observed result:

```json
{
  "ok": false,
  "elapsedMs": 15006,
  "error": "timeout after 15000ms"
}
```

## Additional Validation Already Completed

- Credentials file was moved to an ASCII-only path:
  - `/Users/mmobay202303/bq_sa.json`
- Node can read the file successfully:

```js
require("/Users/mmobay202303/bq_sa.json").client_email
```

Observed output:

```text
bigquery-readonly@online-stars.iam.gserviceaccount.com
```

## Current Conclusion

The issue does not appear to be caused by:

- wrong project id
- wrong dataset
- wrong table path
- wrong token filter
- credentials file path containing spaces or Chinese characters
- `keyFilename` vs direct `credentials JSON`

Current best hypothesis:

- The Node.js runtime in this local environment is hanging when calling the BigQuery SDK itself.
- The problem looks environmental/runtime-related rather than specific to the application’s SQL or fund-flow aggregation logic.

## Local App URL

- [http://localhost:3000/onchain](http://localhost:3000/onchain)

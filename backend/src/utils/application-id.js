import { Application } from '../models/application.model.js';

export function formatApplicationId(sequenceNumber) {
  return `APP-${String(sequenceNumber).padStart(4, '0')}`;
}

export function parseApplicationIdSequence(applicationId) {
  if (!applicationId || typeof applicationId !== 'string') return 0;
  const match = applicationId.match(/^APP-(\d+)$/i);
  return match ? parseInt(match[1], 10) : 0;
}

export async function getNextCandidateApplicationId(session = null) {
  try {
    const pipeline = [
      { $match: { applicationId: { $regex: /^APP-\d+$/i } } },
      {
        $project: {
          num: {
            $toInt: {
              $arrayElemAt: [{ $split: ['$applicationId', '-'] }, 1]
            }
          }
        }
      },
      { $sort: { num: -1 } },
      { $limit: 1 }
    ];
    const agg = Application.aggregate(pipeline);
    if (session) agg.session(session);
    const result = await agg.exec();
    const maxSeq = result.length > 0 && Number.isInteger(result[0].num) ? result[0].num : 0;
    return formatApplicationId(maxSeq + 1);
  } catch (_err) {
    const apps = await Application.find({ applicationId: { $regex: /^APP-\d+$/i } }, { applicationId: 1 }).lean();
    let max = 0;
    for (const a of apps) {
      const seq = parseApplicationIdSequence(a.applicationId);
      if (seq > max) max = seq;
    }
    return formatApplicationId(max + 1);
  }
}

export async function executeWithApplicationIdRetry(actionFn, maxRetries = 5) {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await actionFn();
    } catch (err) {
      const isDuplicateAppId =
        err.code === 11000 &&
        (err.keyPattern?.applicationId || (typeof err.message === 'string' && err.message.includes('applicationId')));
      if (isDuplicateAppId && attempt < maxRetries - 1) {
        attempt++;
        await new Promise((resolve) => setTimeout(resolve, 20 + Math.floor(Math.random() * 40)));
        continue;
      }
      throw err;
    }
  }
}

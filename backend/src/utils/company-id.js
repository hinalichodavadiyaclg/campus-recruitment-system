import { Company } from '../models/company.model.js';

export function formatCompanyId(sequenceNumber) {
  return `COMP-${String(sequenceNumber).padStart(4, '0')}`;
}

export function parseCompanyIdSequence(companyId) {
  if (!companyId || typeof companyId !== 'string') return 0;
  const match = companyId.match(/^COMP-(\d+)$/i);
  return match ? parseInt(match[1], 10) : 0;
}

export async function getNextCandidateCompanyId(session = null) {
  try {
    const pipeline = [
      { $match: { companyId: { $regex: /^COMP-\d+$/i } } },
      {
        $project: {
          num: {
            $toInt: {
              $arrayElemAt: [{ $split: ['$companyId', '-'] }, 1]
            }
          }
        }
      },
      { $sort: { num: -1 } },
      { $limit: 1 }
    ];
    const agg = Company.aggregate(pipeline);
    if (session) agg.session(session);
    const result = await agg.exec();
    const maxSeq = result.length > 0 && Number.isInteger(result[0].num) ? result[0].num : 0;
    return formatCompanyId(maxSeq + 1);
  } catch (_err) {
    const companies = await Company.find({ companyId: { $regex: /^COMP-\d+$/i } }, { companyId: 1 }).lean();
    let max = 0;
    for (const c of companies) {
      const seq = parseCompanyIdSequence(c.companyId);
      if (seq > max) max = seq;
    }
    return formatCompanyId(max + 1);
  }
}

export async function executeWithCompanyIdRetry(actionFn, maxRetries = 5) {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await actionFn();
    } catch (err) {
      const isDuplicateCompanyId =
        err.code === 11000 &&
        (err.keyPattern?.companyId || (typeof err.message === 'string' && err.message.includes('companyId')));
      if (isDuplicateCompanyId && attempt < maxRetries - 1) {
        attempt++;
        await new Promise((resolve) => setTimeout(resolve, 20 + Math.floor(Math.random() * 40)));
        continue;
      }
      throw err;
    }
  }
}

import { Job } from '../models/job.model.js';

export function formatJobId(sequenceNumber) {
  return `JOB-${String(sequenceNumber).padStart(4, '0')}`;
}

export function parseJobIdSequence(jobId) {
  if (!jobId || typeof jobId !== 'string') return 0;
  const match = jobId.match(/^JOB-(\d+)$/i);
  return match ? parseInt(match[1], 10) : 0;
}

export async function getNextCandidateJobId(session = null) {
  try {
    const pipeline = [
      { $match: { jobId: { $regex: /^JOB-\d+$/i } } },
      {
        $project: {
          num: {
            $toInt: {
              $arrayElemAt: [{ $split: ['$jobId', '-'] }, 1]
            }
          }
        }
      },
      { $sort: { num: -1 } },
      { $limit: 1 }
    ];
    const agg = Job.aggregate(pipeline);
    if (session) agg.session(session);
    const result = await agg.exec();
    const maxSeq = result.length > 0 && Number.isInteger(result[0].num) ? result[0].num : 0;
    return formatJobId(maxSeq + 1);
  } catch (_err) {
    const jobs = await Job.find({ jobId: { $regex: /^JOB-\d+$/i } }, { jobId: 1 }).lean();
    let max = 0;
    for (const j of jobs) {
      const seq = parseJobIdSequence(j.jobId);
      if (seq > max) max = seq;
    }
    return formatJobId(max + 1);
  }
}

export async function executeWithJobIdRetry(actionFn, maxRetries = 5) {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await actionFn();
    } catch (err) {
      const isDuplicateJobId =
        err.code === 11000 &&
        (err.keyPattern?.jobId || (typeof err.message === 'string' && err.message.includes('jobId')));
      if (isDuplicateJobId && attempt < maxRetries - 1) {
        attempt++;
        await new Promise((resolve) => setTimeout(resolve, 20 + Math.floor(Math.random() * 40)));
        continue;
      }
      throw err;
    }
  }
}

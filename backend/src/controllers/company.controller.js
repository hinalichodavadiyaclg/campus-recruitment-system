import * as companyService from '../services/company.service.js';
import { sendSuccess } from '../utils/api-response.js';
import { asyncHandler } from '../utils/async-handler.js';

export const listCompanies = asyncHandler(async (request, response) =>
  sendSuccess(response, 200, await companyService.listCompanies(response.locals.input?.query || request.query || {}))
);

export const getCompany = asyncHandler(async (request, response) =>
  sendSuccess(response, 200, await companyService.getCompanyById(response.locals.input?.params?.id || request.params.id))
);

export const createCompany = asyncHandler(async (request, response) =>
  sendSuccess(response, 201, await companyService.createCompany(response.locals.input?.body || request.body))
);

export const updateCompany = asyncHandler(async (request, response) =>
  sendSuccess(response, 200, await companyService.updateCompany(response.locals.input?.params?.id || request.params.id, response.locals.input?.body || request.body))
);

export const deleteCompany = asyncHandler(async (request, response) =>
  sendSuccess(response, 200, await companyService.deleteCompany(response.locals.input?.params?.id || request.params.id))
);

export const getMyCompanyProfile = asyncHandler(async (request, response) =>
  sendSuccess(response, 200, await companyService.getCompanyByUserId(request.auth.userId))
);

export const updateMyCompanyProfile = asyncHandler(async (request, response) =>
  sendSuccess(response, 200, await companyService.updateMyCompanyProfile(request.auth.userId, request.body))
);

export const listCompanyRecruiters = asyncHandler(async (request, response) =>
  sendSuccess(response, 200, await companyService.listCompanyRecruiters(response.locals.input?.params?.id || request.params.id))
);

export const createCompanyRecruiter = asyncHandler(async (request, response) =>
  sendSuccess(
    response,
    201,
    await companyService.createCompanyRecruiter(
      response.locals.input?.params?.id || request.params.id,
      response.locals.input?.body || request.body
    )
  )
);

export const updateCompanyRecruiter = asyncHandler(async (request, response) =>
  sendSuccess(
    response,
    200,
    await companyService.updateCompanyRecruiter(
      response.locals.input?.params?.id || request.params.id,
      response.locals.input?.params?.recruiterId || request.params.recruiterId,
      response.locals.input?.body || request.body
    )
  )
);

export const deleteCompanyRecruiter = asyncHandler(async (request, response) =>
  sendSuccess(
    response,
    200,
    await companyService.deleteCompanyRecruiter(
      response.locals.input?.params?.id || request.params.id,
      response.locals.input?.params?.recruiterId || request.params.recruiterId,
      request.auth?.userId
    )
  )
);

// Copyright © 2025 Navarrotech

// Core
import express from 'express'
import { PrismaClient } from '@prisma/client'

// Typescript
import type { ItemPriceReport } from '@prisma/client'
import type { Request, Response, NextFunction } from 'express'
import type { ResponseShape } from './types'

// Middleware
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'

// Utility
import { createHash } from 'crypto'
import { log, logAttributes, logDebug, logError, logSuccess } from './logging'
import { yup } from './validators'

// Misc
import { NODE_ENV, VERSION, PORT } from './env'

// //////////////////////// //
//           Core           //
// //////////////////////// //

const app = express()
const prisma = new PrismaClient()
const validationOptions: yup.ValidateOptions = {
  abortEarly: false,
  disableStackTrace: true,
  stripUnknown: true,
  recursive: true,
}

// //////////////////////// //
//        Middleware        //
// //////////////////////// //

app.use(
  // CORS
  cors({
    origin: true,
    credentials: true,
  }),
  // Rate limiting
  rateLimit({
    max: 9,
    windowMs: 15_000,
    standardHeaders: true
  }),
  helmet(),
  // Parse incoming POST request bodys
  express.json({
    limit: '100mb',
  }),
  // @ts-ignore If they've sent an invalid JSON in the body of a POST request, let's catch it here!
  function catchJsonError(err: Error, req: Request, res: Response, next: NextFunction) {
    // @ts-ignore
    if (err instanceof SyntaxError && err?.status === 400 && 'body' in err) {
      res.status(406).send({
        code: 406,
        message: 'Bad request: Invalid JSON received in body payload',
      } as ResponseShape)
      return
    } else {
      next()
    }
  },
)

// //////////////////////// //
//        Validators        //
// //////////////////////// //

const itemIdSchema = yup
  .string()
  .replace(/[^a-zA-Z0-9]/g)
  .maxTrim(32)
  .trim()
  .required()

const storeIdSchema = yup
  .string()
  .replace(/[^a-zA-Z0-9]/g)
  .maxTrim(8)
  .trim()
  .required()

const reportSchema = yup.object().shape({
  itemId: itemIdSchema.clone(),
  storeId: storeIdSchema.clone(),
  itemName: yup
    .string()
    .replace(/[^a-zA-Z0-9]/g)
    .maxTrim(96)
    .trim()
    .optional(),
  price: yup
    .number()
    .minTrim(-1)
    .maxTrim(100_000)
    .required(),
})

const reportRequestBody = yup.object().shape({
  reports: yup.array().of(reportSchema).max(100).required(),
  version: yup
    .number()
    .min(1, "Unsupported version")
    .max(1, "Unsupported version")
    .default(1),
})

const getReportsQuery = yup.object().shape({
  storeId: storeIdSchema.clone(),
  itemIds: yup
    .array()
    .of(storeIdSchema.clone()),
  page: yup
    .number()
    .optional()
    .default(0)
    .min(0)
    .max(100),
})

// //////////////////////// //
//          Routes          //
// //////////////////////// //

app.post('/reports', async (request, response) => {
  const { body } = request

  try {
    // Validation:
    const data = await reportRequestBody.validate(
      body, 
      validationOptions
    )

    const { reports, version } = data

    logDebug('Received report:', data)

    // Remapping by version:
    let remappedReports: ItemPriceReport[] = []
    if (version === 1) {
      remappedReports = reports.map((report) => ({
        // Prisma will handle the 'ID' and 'created' fields
        // id: undefined,
        // created: new Date(),

        // Data from the report:
        name: report.itemName,
        price: report.price,
        skuid: report.itemId,
        storeid: report.storeId,

        // hashed Ip address of the reporter:
        reporter: createHash('sha256')
          .update(request.ip)
          .digest('hex'),
      } as ItemPriceReport))
    }
    else {
      throw new Error('Unsupported version')
    }
    
    // Instead of blanket adding them:
    // await prisma.itemPriceReport.createMany({
    //   data: remappedReports,
    // })

    // We go through each report, and if the price hasn't changed we don't add the new report
    const promises = []
    for (const report of remappedReports) {
      promises.push(new Promise(async (accept) => {
        const lastReport = await prisma.itemPriceReport.findFirst({
          where: {
            storeid: report.storeid,
            skuid: report.skuid,
          },
          orderBy: {
            created: 'desc',
          },
        })

        if (lastReport?.price !== report.price) {
          await prisma.itemPriceReport.create({
            data: report,
          })
        }

        accept(null)
      }))
    }

    response.status(200).send({
      code: 200,
      message: 'OK',
    } as ResponseShape)
  }
  catch (error: unknown) {
    if (error instanceof yup.ValidationError) {
      response.status(400).send({
        code: 400,
        message: 'Bad request: Invalid data received in body payload',
        data: error.errors,
      } as ResponseShape)
      return
    }
    // else if (error instanceof PrismaClientKnownRequestError) {
      // PrismaClientKnownRequestError
      // PrismaClientUnknownRequestError
      // PrismaClientRustPanicError
      // PrismaClientInitializationError
      // PrismaClientValidationError
    // }
    else if (error instanceof Error) {
      response.status(500).send({
        code: 500,
        message: error.message,
      } as ResponseShape)
      logError('Error in /report:', error.message)
      logDebug(error.stack)
    }
    else {
      response.status(500).send({
        code: 500,
        message: 'Internal server error',
      } as ResponseShape)
      logError('Error in /report:', error)
    }
  }
})

app.get('/reports', async (request, response) => {
  const { query } = request
  try {
    const data = await getReportsQuery.validate(
      query,
      validationOptions
    )

    const { storeId, itemIds, page } = data

    logDebug('Received query:', data)

    const reports = await prisma.itemPriceReport.findMany({
      // Sanity safety check:
      take: 10_000,
      skip: page * 10_000,
      // Query:
      where: {
        storeid: storeId,
        skuid: {
          in: itemIds,
        },
      },
      // Sorting:
      orderBy: {
        created: 'desc',
      },
      // Omitting fields:
      omit: {
        id: true,
        reporter: true,
      }
    })

    logDebug('Found reports:', reports)

    response.status(200).send({
      code: 200,
      message: 'OK',
      data: reports,
    } as ResponseShape<ItemPriceReport[]>)
  }
  catch (error: unknown) {
    if (error instanceof yup.ValidationError) {
      response.status(400).send({
        code: 400,
        message: 'Bad request: Invalid query parameters',
        data: error.errors,
      } as ResponseShape)
      return
    }
    else if (error instanceof Error) {
      response.status(500).send({
        code: 500,
        message: error.message,
      } as ResponseShape)
      logError('Error in /reports:', error.message)
      logDebug(error.stack)
    }
    else {
      response.status(500).send({
        code: 500,
        message: 'Internal server error',
      } as ResponseShape)
      logError('Error in /reports:', error)
    }
  }
})

// Catchall
app.all('*', (_, response) => {
  response.sendStatus(204)
})

// //////////////////////// //
//           Jobs           //
// //////////////////////// //

// Data within 24 hours can have a max of 100 entries per hour per store/item
// Data after 24 hours -> 1 week can have a max of 1 entries per hour per store/item
// Data after 1 week -> 1 month can have a max of 1 entry per day per store/item
// Data after 1 month -> 6 months can have a max of 1 entry per week per store/item
// Data older than 6 months can have a max of 1 entry per month per store/item

// setInterval(() => {
//   log('Cleaning up old data')
// }, 60_000)

// //////////////////////// //
//           Init           //
// //////////////////////// //

// Startup
Promise.all([
  prisma.$connect(),
])
.then(() => {
  app.listen(PORT, () => {
    log('API Startup Complete')
    logAttributes({
      Port: PORT,
      Version: VERSION,
      Environment: NODE_ENV,
    })
    logSuccess('Created by Navarrotech ' + new Date().getFullYear())
  })
})

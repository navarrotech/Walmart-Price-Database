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
import { log, logAttributes, logDebug, logSuccess, logToDiscord } from './logging'
import { yup } from './validators'

// Misc
import { NODE_ENV, VERSION, PORT } from './env'
import { handleErrorResponse } from './response'

import './criticalReporting'

// //////////////////////// //
//           Core           //
// //////////////////////// //

const app = express()
const prisma = new PrismaClient()
const validationOptions: yup.ValidateOptions = {
  abortEarly: false,
  disableStackTrace: true,
  stripUnknown: true,
  recursive: true
}

// //////////////////////// //
//        Middleware        //
// //////////////////////// //

app.set('trust proxy', true)

app.use(
  // CORS
  cors({
    origin: true,
    credentials: true
  }),
  // Rate limiting
  rateLimit({
    max: 12,
    windowMs: 20_000,
    standardHeaders: true
  }),
  helmet(),
  // Parse incoming POST request bodys
  express.json({
    limit: '100mb'
  }),
  // @ts-ignore If they've sent an invalid JSON in the body of a POST request, let's catch it here!
  function catchJsonError(err: Error, req: Request, res: Response, next: NextFunction) {
    // @ts-ignore
    if (err instanceof SyntaxError && err?.status === 400 && 'body' in err) {
      res.status(406).send({
        code: 406,
        message: 'Bad request: Invalid JSON received in body payload'
      } as ResponseShape)
    }
    else {
      next()
    }
  }
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
    .replace(/[^a-zA-Z0-9\s]/g)
    .maxTrim(96)
    .trim()
    .optional(),
  price: yup
    .number()
    .minTrim(-1)
    .maxTrim(100_000)
    .required()
})

const reportRequestBody = yup.object().shape({
  reports: yup.array().of(reportSchema).max(100).required(),
  version: yup
    .number()
    .min(1, 'Unsupported version')
    .max(1, 'Unsupported version')
    .default(1)
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
    .max(150)
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
    const ip: string = request.headers['x-forwarded-for']
      ? (request.headers['x-forwarded-for'] as string).split(',')[0]
      : request.socket.remoteAddress || request.ip

    logDebug(`Received report from ${ip}:`, {
      version,
      reports: [ `${reports.length} items` ]
    })

    const reporter = createHash('sha256')
      .update(ip)
      .digest('hex')

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

        // Hashed IP address of the reporter:
        reporter
      } as ItemPriceReport))
    }
    else {
      throw new Error('Unsupported version')
    }

    // Instead of blanket adding them:
    // await prisma.itemPriceReport.createMany({
    //   data: remappedReports,
    // })

    // New user success reporting
    const existingUserEntry = await prisma.itemPriceReport.findFirst({
      where: {
        reporter
      }
    })

    // We go through each report, and if the price hasn't changed we don't add the new report
    const promises = []
    for (const report of remappedReports) {
      if (report.price < 0) {
        logDebug('Skipping (< $0) report:', report)
        continue
      }

      promises.push(
        // eslint-disable-next-line no-async-promise-executor
        new Promise(async (accept) => {
          const lastReport = await prisma.itemPriceReport.findFirst({
            where: {
              storeid: report.storeid,
              skuid: report.skuid,
              // Created within the last 8 hours:
              created: {
                gte: new Date(Date.now() - 8 * 60 * 60 * 1000)
              }
            },
            orderBy: {
              created: 'desc'
            }
          })

          if (lastReport?.price !== report.price) {
            await prisma.itemPriceReport.create({
              data: report
            })
          }

          accept(null)
        })
      )
    }

    await Promise.allSettled(promises)

    response
      .status(200)
      .send({
        code: 200,
        message: 'OK'
      } as ResponseShape)

    if (!existingUserEntry) {
      try {
        const ipLocation = await fetch(`http://ip-api.com/json/${ip}`)
        if (!ipLocation.ok) {
          throw new Error('Failed to fetch IP location')
        }
        const asJson = await ipLocation.json()
        await logToDiscord(
          `New user joined and reported ${remappedReports.length} items! (Neat)\n`,
          `IP: ${ip}\n`,
          `Location: ${asJson.city}, ${asJson.regionName}, ${asJson.country}`
        )
      }
      catch {
        await logToDiscord(
          `New user joined and reported ${remappedReports.length} items! (Neat)`
        )
      }
    }
  }
  catch (error: unknown) {
    handleErrorResponse(
      request,
      response,
      error
    )
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
          in: itemIds
        }
      },
      // Sorting:
      orderBy: {
        created: 'desc'
      },
      // Omitting fields:
      omit: {
        id: true,
        reporter: true
      }
    })

    logDebug('Found reports:', reports)

    response.status(200).send({
      code: 200,
      message: 'OK',
      data: reports
    } as ResponseShape<ItemPriceReport[]>)
  }
  catch (error: unknown) {
    handleErrorResponse(
      request,
      response,
      error
    )
  }
})

app.get('/ping', (_, response) => {
  response.status(200).send({
    code: 200,
    message: 'Pong!'
  } as ResponseShape)
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
  prisma.$connect()
])
  .then(() => {
    app.listen(PORT, () => {
      log('API Startup Complete')
      logAttributes({
        Port: PORT,
        Version: VERSION,
        Environment: NODE_ENV
      })
      logSuccess('Created by Navarrotech ' + new Date().getFullYear())
    })
  })

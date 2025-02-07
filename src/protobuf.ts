//Copyright © 2024 Navarrotech.

import ProtoBufs from './generated/ProtoTypes'
import { NODE_ENV } from '@/env'

export type ProtoBufTables = keyof typeof ProtoBufs

import type { Request, Response, NextFunction } from '@/types'

export function protobufMiddleware(request: Request, response: Response, next: NextFunction) {

  // For sending protobuf payloads
  response.sendProto = function sendProto(struct, data) {
    const Construct = ProtoBufs[struct]

    if (!Construct) {
      response.status(400).json('Invalid protobuf struct')
      return
    }

    try {
      const Message = Construct.fromObject(data)
    
      response.setHeader('Content-Type', 'application/x-protobuf')
      response.setHeader('Access-Control-Expose-Headers', 'X-Protobuf-Struct')
      response.setHeader('X-Protobuf-Struct', struct)

      // We only support JSON payloads in development for testing with postman/thunderclient
      if (NODE_ENV === 'development' && request.headers['content-type'] === 'application/json') {
        response.setHeader('Content-Type', 'application/json')
        response.send(JSON.stringify(Message))
        return
      }

      response.send(
        // @ts-ignore
        Construct.encode(Message).finish()
      )

    }
    catch (error: any) {
      console.error('[Protobuf SendProto Error] :: ', error.message, struct, data)
    }
  }

  const contentType = request.headers['content-type']?.toLowerCase()
  const accept = request.headers['accept']?.toLowerCase()

  // For handling incoming protobuf payloads
  if (contentType === 'application/x-protobuf') {

    const struct = request.headers['x-protobuf-struct'] as string | undefined

    const Construct = ProtoBufs[struct]
    if (struct && typeof struct === 'string' && Construct) {
      try {
        const buffer: Uint8Array[] = []
        request.on('data', (chunk) => buffer.push(chunk))
        request.on('end', () => {
          try {
            const buffy = Buffer.concat(buffer)
            request.body = ProtoBufs[struct].decode(buffy).toJSON()
          }
          catch (error){
            console.error('[Protobuf Parsing Error 1] :: ', error.message, struct, buffer)
            if (!response.headersSent) {
              response.status(400)
              response.sendProto('ServerError', { message: 'Invalid protobuf payload given!' })
              return
            }
          }
          next()
        })
      }
      catch (error: any) {
        console.error('[Protobuf Parsing Error 2] :: ', error)
        if (!response.headersSent) {
          response.status(400)
          response.sendProto('ServerError', { message: 'Invalid protobuf payload given!' })
        }
      }
      return
    }
    else {
      response.status(400)
      response.send('Unknown protobuf struct')
      return
    }
  }
  // We only allow JSON payloads in dev for testing with postman/thunderclient
  else if (contentType === 'application/json' && NODE_ENV === 'development') {
    request.on('data', (chunk) => {
      try {
        request.body = JSON.parse(
          chunk.toString()
        )
      }
      catch (error) {
        console.error('[JSON Parsing Error] :: ', error)
        response.status(400)
        response.send('Invalid JSON payload given!')
        return
      }
    })

    request.on('end', () => {
      next()
    })

    return
  }
  // Could be an HTML request (like /docs or public folder)
  else if (
    (
      request.method === 'GET'
            || request.method === 'HEAD'
            || request.method === 'OPTIONS'
    )
        && (
          accept.includes('text/html') 
            || accept.includes('*/*')
        )
  ) {
    next()
    return
  }

  response.status(400)
  response.send('Invalid content-type, allowed: '
        + (NODE_ENV === 'development'
          ? '[\'Application/X-Protobuf\', \'application/json\']'
          : '[\'Application/X-Protobuf\']')
  )
}

export type Sanitized<T> = {
    [K in keyof T]: T[K] extends Date ? string : T[K] extends object ? Sanitized<T[K]> : T[K]
}
export function sanitize<T>(object: T): Sanitized<T> {

  // You can never be too safe ;)
  // @ts-ignore
  delete object.passwords
  // @ts-ignore
  delete object.password

  if (Array.isArray(object)) {
    return object.map(sanitize) as any
  }

  const keys = Object.keys(object) as Array<keyof T>

  for (const key of keys) {
    if (!object[key]) {
      continue
    }
    else if (object[key] instanceof Date) {
      object[key] = (object[key] as Date).toISOString() as any
    }
    else if (typeof object[key] === 'object') {
      object[key] = sanitize(object[key]) as any
    }
  }

  return object as Sanitized<T>
}

export {
  ProtoBufs
}

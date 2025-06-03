// Copyright © 2025 Navarrotech

/* eslint-disable no-invalid-this, @typescript-eslint/no-unused-vars */

import * as yup from 'yup'

// Extend yup's type definitions for our custom methods
declare module 'yup' {
  // Extend StringSchema with a custom maxTrim method.
  interface StringSchema<
    TType extends yup.Maybe<string> = string,
    TContext = yup.AnyObject,
    TDefault = undefined,
    TFlags extends yup.Flags = ''
  > {
    /**
     * Custom maxTrim method for strings.
     * If the string length exceeds `max`, it is truncated.
     */
    maxTrim(max: number): this

    /**
     * Custom replace method for strings.
     * Replaces all occurrences matching the regex with the provided replacement.
     * Defaults to an empty string if no replacement is provided.
     */
    replace(regex: RegExp, replacement?: string): this
  }

  // Extend NumberSchema with custom maxTrim and minTrim methods.
  interface NumberSchema<
    TType extends yup.Maybe<number> = number,
    TContext = yup.AnyObject,
    TDefault = undefined,
    TFlags extends yup.Flags = ''
  > {
    /**
     * Custom maxTrim method for numbers.
     * If the number is greater than `max`, it is clamped to `max`.
     */
    maxTrim(max: number): this

    /**
     * Custom minTrim method for numbers.
     * If the number is less than `min`, it is clamped to `min`.
     */
    minTrim(min: number): this
  }
}


// Custom maxTrim for string schema: trims the string to a maximum length
yup.addMethod(yup.string, 'maxTrim', function(max: number) {
  return this.transform(function(value: any, originalValue: any) {
    if (typeof originalValue === 'string' && originalValue.length > max) {
      return originalValue.slice(0, max)
    }
    return value
  })
})

// Custom replace for strings: replaces all matches of the regex with the given replacement.
// By default, the replacement is an empty string.
yup.addMethod(yup.string, 'replace', function(regex: RegExp, replacement: string = '') {
  return this.transform((value: any, originalValue: any) => {
    if (typeof originalValue === 'string') {
      return originalValue.replace(regex, replacement)
    }
    return value
  })
})

// Custom maxTrim for number schema: clamps the number to the specified maximum
yup.addMethod(yup.number, 'maxTrim', function(max: number) {
  return this.transform(function(value: any, originalValue: any) {
    if (typeof originalValue === 'number' && originalValue > max) {
      return max
    }
    return value
  })
})

// Custom minTrim for number schema: clamps the number to the specified minimum
yup.addMethod(yup.number, 'minTrim', function(min: number) {
  return this.transform(function(value: any, originalValue: any) {
    if (typeof originalValue === 'number' && originalValue < min) {
      return min
    }
    return value
  })
})

export {
  yup
}

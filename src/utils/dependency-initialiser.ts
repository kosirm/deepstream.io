'use strict'

const C = require('../constants/constants')

import { EventEmitter } from 'events'

interface Plugin extends EventEmitter {
  init: Function,
  isReady: Function,
  setDeepstream: Function
}

export default class DependencyInitialiser extends EventEmitter {
  public isReady: boolean

  private options: any
  private dependency: any
  private name: string
  private timeout: any

/**
 * This class is used to track the initialisation of
 * an individual dependency (cache connector, persistance connector,
 * message connector, logger)
 */
  constructor (deepstream, options, dependency: Plugin, name: string) {
    super()
    this.isReady = false

    this.options = options
    this.dependency = dependency
    this.name = name
    this.timeout = null

    if (typeof this.dependency.on !== 'function' && typeof this.dependency.isReady === 'undefined') {
      const errorMessage = `${this.name} needs to implement isReady or be an emitter`
      this.options.logger.error(C.EVENT.PLUGIN_INITIALIZATION_ERROR, errorMessage)
      const error = (new Error(errorMessage)) as any
      error.code = 'PLUGIN_INITIALIZATION_ERROR'
      throw error
    }

    if (this.dependency.setDeepstream instanceof Function) {
      this.dependency.setDeepstream(deepstream)
    }

    if (this.dependency.isReady) {
      this._onReady()
    } else {
      this.timeout = setTimeout(
      this._onTimeout.bind(this),
      this.options.dependencyInitialisationTimeout
    )
      this.dependency.once('ready', this._onReady.bind(this))
      this.dependency.on('error', this._onError.bind(this))

      if (this.dependency.init) {
        this.dependency.init()
      }
    }
  }

/**
 * Returns the underlying dependency (e.g. the Logger, StorageConnector etc.)
 */
  public getDependency () {
    return this.dependency
  }

/**
 * Callback for succesfully initialised dependencies
 */
  private _onReady (): void {
    if (this.timeout) {
      clearTimeout(this.timeout)
    }

    this.dependency.type = this.dependency.description || this.dependency.type
    const dependencyType = this.dependency.type ? `: ${this.dependency.type}` : ': no dependency description provided'
    this.options.logger.info(C.EVENT.INFO, `${this.name} ready${dependencyType}`)

    process.nextTick(this._emitReady.bind(this))
  }

/**
 * Callback for dependencies that weren't initialised in time
 */
  private _onTimeout (): void {
    const message = `${this.name} wasn't initialised in time`
    this._logError(message)
    const error = (new Error(message)) as any
    error.code = C.EVENT.PLUGIN_INITIALIZATION_TIMEOUT
    throw error
  }

/**
* Handles errors emitted by the dependency at startup.
*
* Plugin errors that occur at runtime are handled by the deepstream.io main class
*
* @param {Error|String} error
*/
  private _onError (error): void {
    if (this.isReady !== true) {
      this._logError(`Error while initialising ${this.name}: ${error.toString()}`)
      error.code = C.EVENT.PLUGIN_INITIALIZATION_ERROR
      throw error
    }
  }

/**
 * Emits the ready event after a one tick delay
 */
  private _emitReady (): void {
    this.isReady = true
    this.emit('ready')
  }

/**
 * Logs error messages
 *
 * Since the logger is a dependency in its own right, it can't be relied upon
 * here. If it is available, it will be used, otherwise the error will be logged
 * straight to the console
 */
  private _logError (message: string): void {
    if (this.options.logger && this.options.logger.isReady) {
      this.options.logger.error(C.EVENT.PLUGIN_ERROR, message)
    } else {
      console.error('Error while initialising dependency')
      console.error(message)
    }
  }

}


import fs from 'node:fs/promises'
import { URL } from 'node:url'
import * as cheerio from 'cheerio'

/**
 *
 * @param {string} url
 * @returns {void|string}
 */
const getFilename = (url, response) => {
  const parsed = new URL(url)
  if (parsed) {
    url = parsed.hostname + parsed.pathname
  }
  else {
    return
  }
  return url.replaceAll(/[^\w\d]/g, '-') + '.html'
}

/**
 *
 * @param {string} url
 * @returns {Promise<{ text: string, filename: string }>}
 */
export const downloadPage = (url) => {
  return new Promise((resolve, reject) => {
    fetch(url).then((response) => {
      response.text().then((text) => {
        let filename = getFilename(url, response)
        if (!filename) {
          reject(new Error('invalid url'))
        }
        else {
          resolve({ text, filename })
        }
      // eslint-disable-next-line
      }).catch(e => reject(e))
    // eslint-disable-next-line
    }).catch(e => reject(e))
  })
}

/**
 *
 * @param {string} url
 * @param {string} folder
 * @returns {Promise<string>} resulting path
 */
export const downloadPageToFolder = (url, folder) => {
  return new Promise((resolve, reject) => {
    downloadPage(url).then((result) => {
      const resultPath = folder + '/' + result.filename
      fs.writeFile(resultPath, result.text).then(() => {
        resolve(resultPath)
      // eslint-disable-next-line
      }).catch(e => reject(e))
    // eslint-disable-next-line
    }).catch(e => reject(e))
  })
}

/**
 *
 * @param {string} url
 * @returns {Promise<{ buffer: Buffer, filename: string }>}
 */
export const downloadImg = (url) => {
  return new Promise((resolve, reject) => {
    fetch(url).then((response) => {
      response.arrayBuffer().then((buffer) => {
        let filename = getFilename(url, response)
        if (!filename) {
          reject(new Error('invalid url'))
        }
        else {
          resolve({ buffer: Buffer.from(new Uint8Array(buffer)), filename })
        }
      // eslint-disable-next-line
      }).catch(e => reject(e))
    // eslint-disable-next-line
    }).catch(e => reject(e))
  })
}

/**
 * 
 * @param {*} resourceUrl 
 * @param {*} imgPath 
 * @returns {Promise<string>}
 */
const downloadImgAsResource = (resourceUrl, imgPath) => {
  return new Promise((resolve, reject) => {
    resolve('1.jpeg')
  })
}

/**
 * @param {string} url
 * @param {string} text
 * @param {(oldImg: string) => Promise<string|void>} converter
 * @returns {Promise<[string, string[]]>} resulting page & urls
 */
const transformPage = (url, text, converter) => {
  const promises = [];

  const $ = cheerio.load(text)
  for (const imgEl of $('img')) {
    // @ts-ignore
    const oldSrc = imgEl.attributes.src
    const resolvedUrl = new URL(oldSrc, url)
    
    promises.push(converter(resolvedUrl.toString()).then((newUrl) => {
      // @ts-ignore
      if (newUrl) imgEl.attributes.src = newUrl
      return newUrl
    }).catch(() => {}))
  }

  return new Promise((resolve) => {
    Promise.all(promises).then((urls) => {
      resolve([$.html(), urls])
    })
  })
}

/**
 *
 * @param {string} url
 * @param {string} folder
 * @returns {Promise<string[]>} resulting path
 */
export const downloadPageWithResourcesToFolder = (url, folder) => {
  return new Promise((resolve, reject) => {
    downloadPage(url).then((result) => {
      transformPage(url, result.text, (oldImg) => downloadImgAsResource(url, oldImg)).then(([html, imgs]) => {
        const resultPath = folder + '/' + result.filename
        fs.writeFile(resultPath, html).then(() => {
          resolve([resultPath, ...imgs])
        // eslint-disable-next-line
        }).catch(e => reject(e))
      })
      
      
    // eslint-disable-next-line
    }).catch(e => reject(e))
  })
}

import fs from 'node:fs/promises'
import { URL } from 'node:url'
import * as cheerio from 'cheerio'

/**
 *
 * @param {string} url
 * @returns {void|string}
 */
const getFilename = (url) => {
  const parsed = new URL(url)
  if (parsed) {
    url = parsed.hostname + parsed.pathname
  }
  else {
    return
  }
  if (url.endsWith('.jpeg')) {
    url = url.slice(0, -5)
  }
  else if (url.endsWith('.png')) {
    url = url.slice(0, -4)
  }
  else if (url.endsWith('.jpg')) {
    url = url.slice(0, -4)
  }
  return url.replaceAll(/[^\w\d]/g, '-')
}

/**
 *
 * @param {Response} response
 * @returns {string}
 */
const getFormat = (response) => {
  switch (response.headers.get('content-type')) {
    case 'image/jpeg':
      return '.jpeg'
    default:
      return '.html'
  }
}

/**
 *
 * @param {string} pageUrl
 * @returns {string}
 */
const getFolder = (pageUrl) => {
  return getFilename(pageUrl) + '_files'
}

/**
 *
 * @param {string} folder
 * @returns
 */
const createFolder = (folder) => {
  return new Promise((resolve, reject) => {
    fs.access(folder).then(resolve).catch(() => fs.mkdir(folder).then(resolve).catch((e) => {
      if (e instanceof Error && 'code' in e && e.code == 'EEXIST') resolve(true)
      // eslint-disable-next-line
      else reject(e)
    }))
  })
}

/**
 *
 * @param {string} pageUrl
 * @returns {Promise<{ text: string, filename: string }>}
 */
export const downloadPage = (pageUrl) => {
  return new Promise((resolve, reject) => {
    fetch(pageUrl).then((response) => {
      response.text().then((text) => {
        let filename = getFilename(pageUrl) + '.html'
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
 * @param {string} pageUrl
 * @param {string} folder
 * @returns {Promise<string>} resulting path
 */
export const downloadPageToFolder = (pageUrl, folder) => {
  return new Promise((resolve, reject) => {
    downloadPage(pageUrl).then((result) => {
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
 * @param {string} imgUrl
 * @returns {Promise<{ buffer: Buffer, filename: string }>}
 */
export const downloadImg = (imgUrl) => {
  return new Promise((resolve, reject) => {
    fetch(imgUrl).then((response) => {
      response.arrayBuffer().then((buffer) => {
        let filename = getFilename(imgUrl) + getFormat(response)
        if (!filename) {
          reject(new Error('invalid url'))
        }
        else {
          resolve({ buffer: Buffer.from(new Uint8Array(buffer)), filename })
        }
      }).catch(reject)
    }).catch(reject)
  })
}

/**
 *
 * @param {string} pageUrl
 * @param {string} imgPath
 * @param {string} folder
 * @returns {Promise<{ relative: string, full: string }>}
 */
const downloadImgAsResource = (pageUrl, imgPath, folder) => {
  return new Promise((resolve, reject) => {
    downloadImg(imgPath).then((img) => {
      const resultFolder = folder + '/' + getFolder(pageUrl)
      const relativePath = getFolder(pageUrl) + '/' + img.filename
      const resultPath = resultFolder + '/' + img.filename
      createFolder(resultFolder).then(() => {
        fs.writeFile(resultPath, img.buffer)
          .then(() => resolve({ relative: relativePath, full: resultPath }))
          .catch(reject)
      }).catch(reject)
    }).catch(reject)
  })
}

/**
 * @param {string} pageUrl
 * @param {string} htmlText
 * @param {string} folder
 * @returns {Promise<[string, string[]]>} resulting page & urls
 */
const transformPage = (pageUrl, htmlText, folder) => {
  const promises = []

  const $ = cheerio.load(htmlText)
  for (const imgEl of $('img')) {
    const oldSrc = imgEl.attribs.src
    const resolvedUrl = (new URL(oldSrc, pageUrl)).toString()

    promises.push(downloadImgAsResource(pageUrl, resolvedUrl, folder).then((paths) => {
      imgEl.attribs.src = paths.relative
      return paths.full
    }))
  }

  return new Promise((resolve, reject) => {
    Promise.all(promises).then((urls) => {
      resolve([$.html(), urls])
    }).catch(reject)
  })
}

/**
 *
 * @param {string} pageUrl
 * @param {string} folder
 * @returns {Promise<string[]>} resulting path
 */
export const downloadPageWithResourcesToFolder = (pageUrl, folder) => {
  return new Promise((resolve, reject) => {
    downloadPage(pageUrl).then((result) => {
      transformPage(pageUrl, result.text, folder).then(([html, imgs]) => {
        const resultPath = folder + '/' + result.filename
        fs.writeFile(resultPath, html).then(() => {
          resolve([resultPath, ...imgs])
        }).catch(reject)
      }).catch(reject)
    }).catch(reject)
  })
}

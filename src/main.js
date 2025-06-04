import fs from 'node:fs/promises'
import { URL } from 'node:url'
import path from 'node:path'
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
  else if (url.endsWith('.css')) {
    url = url.slice(0, -4)
  }
  else if (url.endsWith('.js')) {
    url = url.slice(0, -3)
  }
  return url.replaceAll(/[^\w\d]/g, '-')
}

/**
 *
 * @param {string} url
 * @param {Response} response
 * @returns {string}
 */
const getFormat = (url, response) => {
  try {
    const tryExt = path.extname(new URL(url).pathname)
    if (tryExt) return tryExt
  // eslint-disable-next-line
  } catch { }

  switch (response.headers.get('content-type')) {
    case 'text/css':
      return '.css'
    case 'image/jpeg':
      return '.jpeg'
    case 'image/png':
      return '.png'
    case 'text/javascript':
      return '.js'
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
 * @returns {Promise<void>}
 */
const createFolder = (folder) => {
  return new Promise((resolve, reject) => {
    fs.access(folder)
      .then(resolve)
      .catch(() => {
        fs.mkdir(folder)
          .then(resolve)
          .catch((e) => {
            if (e instanceof Error && 'code' in e && e.code == 'EEXIST') resolve()
            else errorHandler(reject, undefined, undefined, folder)(e)
          })
      })
  })
}

/**
 *
 * @param {string} pageUrl
 * @returns {Promise<{ text: string, filename: string }>}
 */
const downloadResource2 = (pageUrl) => {
  return new Promise((resolve, reject) => {
    fetch(pageUrl).then((response) => {
      if (!response.ok) {
        errorHandler(reject, pageUrl)(new Error(`${response.status}`))
      } else {
        response.text().then((text) => {
          let filename = getFilename(pageUrl) + getFormat(pageUrl, response)
          if (!filename) {
            reject(new Error('invalid url'))
          }
          else {
            resolve({ text, filename })
          }
        }).catch(errorHandler(reject, pageUrl))
      }
    }).catch(() => errorHandler(reject, pageUrl)(new Error(`could not resolve ${pageUrl}`)))
  })
}

/**
 *
 * @param {string} pageUrl
 * @param {string} folder
 * @returns {Promise<string>} resulting path
 */
const downloadPageToFolder = (pageUrl, folder) => {
  return new Promise((resolve, reject) => {
    downloadResource2(pageUrl).then((result) => {
      const resultPath = folder + '/' + result.filename
      fs.writeFile(resultPath, result.text)
        .then(() => resolve(resultPath))
        .catch(errorHandler(reject, pageUrl, resultPath, folder))
    }).catch(errorHandler(reject, pageUrl, undefined, folder))
  })
}

/**
 *
 * @param {string} imgUrl
 * @returns {Promise<{ buffer: Buffer, filename: string }>}
 */
const downloadImg = (imgUrl) => {
  return new Promise((resolve, reject) => {
    fetch(imgUrl).then((response) => {
      if (!response.ok) {
        errorHandler(reject, imgUrl)(new Error(`${response.status}`))
      } else {
        response.arrayBuffer().then((buffer) => {
          let filename = getFilename(imgUrl) + getFormat(imgUrl, response)
          resolve({ buffer: Buffer.from(new Uint8Array(buffer)), filename })
        }).catch(errorHandler(reject, imgUrl))
      }
    }).catch(() => errorHandler(reject, imgUrl)(new Error(`could not resolve ${imgUrl}`)))
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
          .catch(errorHandler(reject, pageUrl, resultPath, folder))
      }).catch(errorHandler(reject, pageUrl, resultPath, folder))
    }).catch(errorHandler(reject, pageUrl, undefined, folder))
  })
}

/**
 *
 * @param {string} pageUrl
 * @param {string} otherPath
 * @param {string} folder
 * @returns {Promise<{ relative: string, full: string }>}
 */
const downloadOtherAsResource = (pageUrl, otherPath, folder) => {
  return new Promise((resolve, reject) => {
    downloadResource2(otherPath).then((other) => {
      const resultFolder = folder + '/' + getFolder(pageUrl)
      const relativePath = getFolder(pageUrl) + '/' + other.filename
      const resultPath = resultFolder + '/' + other.filename
      createFolder(resultFolder).then(() => {
        fs.writeFile(resultPath, other.text)
          .then(() => resolve({ relative: relativePath, full: resultPath }))
          .catch(errorHandler(reject, pageUrl, resultPath, folder))
      }).catch(errorHandler(reject, pageUrl, resultPath, folder))
    }).catch(errorHandler(reject, pageUrl, undefined, folder))
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

  for (const cssEl of $('link[rel="stylesheet"]')) {
    const oldSrc = cssEl.attribs.href
    const urlObject = new URL(oldSrc, pageUrl)
    if (urlObject.host !== new URL(pageUrl).host) continue
    const resolvedUrl = urlObject.toString()
    promises.push(downloadOtherAsResource(pageUrl, resolvedUrl, folder).then((paths) => {
      cssEl.attribs.href = paths.relative
      return paths.full
    }))
  }

  for (const jsEl of $('script[src]')) {
    const oldSrc = jsEl.attribs.src
    const urlObject = new URL(oldSrc, pageUrl)
    if (urlObject.host !== new URL(pageUrl).host) continue
    const resolvedUrl = urlObject.toString()
    promises.push(downloadOtherAsResource(pageUrl, resolvedUrl, folder).then((paths) => {
      jsEl.attribs.src = paths.relative
      return paths.full
    }))
  }

  return new Promise((resolve, reject) => {
    Promise.all(promises).then((urls) => {
      resolve([$.html(), urls])
    }).catch(errorHandler(reject, pageUrl, undefined, folder))
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
    downloadResource2(pageUrl).then((result) => {
      transformPage(pageUrl, result.text, folder).then(([html, imgs]) => {
        const resultPath = folder + '/' + result.filename
        fs.writeFile(resultPath, html).then(() => {
          resolve([resultPath, ...imgs])
        }).catch(errorHandler(reject, pageUrl, resultPath, folder))
      }).catch(errorHandler(reject, pageUrl, undefined, folder))
    }).catch(errorHandler(reject, pageUrl, undefined, folder))
  })
}

/**
 * 
 * @param {*} reject
 * @param {string|void} url
 * @param {string|void} filename
 * @param {string|void} folder
 * @returns {(error: Error) => void}
 */
const errorHandler = (reject, url, filename, folder) => (error) => {
  if ('code' in error && error.code === 'ENOENT') {
    folder = path.resolve(folder ?? '.')
    const dirUp = path.resolve(folder, '..')
    fs.access(dirUp)
      .then(() => {
        reject(new Error(`output directory '${folder}' no access`))
      })
      .catch(() => {
        reject(new Error(`output directory '${dirUp}' no access`))
      })
  } 
  else if ('code' in error && error.code === 'EACCES') {
    reject(new Error(`no access to ${folder || filename}`))
  }
  else if (error.message.startsWith('404')) {
    reject(new Error(`error 404 no such page '${url}'`))
  } 
  else if (error.message.startsWith('403')) {
    reject(new Error(`error 403 no access to page '${url}'`))
  }
  else {
    reject(error)
  }
}




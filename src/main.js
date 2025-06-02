import fs from 'node:fs/promises'
import { URL } from 'node:url'

const getFilename = (url) => {
  const parsed = new URL(url)
  if (parsed) {
    url = parsed.hostname +  parsed.pathname
  } else {
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
    fetch(url).then(response => {
      response.text().then(text => {
        let filename = getFilename(url)
        if (!filename) {
          reject(new Error('invalid url'))
        } else {
          resolve({ text, filename })
        }
        
      })
    }).catch((e) => {
      reject(e)
    })
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
    downloadPage(url).then(result => {
      const resultPath = folder + '/' + result.filename
      fs.writeFile(resultPath, result.text).then(() => {
        resolve(resultPath)
      }).catch((e) => {
        reject(e)
      })
    }).catch((e) => {
      reject(e)
    })
  })
}

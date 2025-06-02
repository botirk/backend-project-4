/**
 *
 * @param {string} url
 * @returns {Promise<string>}
 */
export const downloadPage = (url) => {
  return new Promise((resolve, reject) => {
    fetch(url).then(response => response.text().then(resolve)).catch(() => reject(new Error('')))
  })
}

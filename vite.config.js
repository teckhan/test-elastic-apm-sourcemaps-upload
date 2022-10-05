import { resolve } from 'path'
import { readFileSync } from 'fs'
import glob from 'glob'
import FormData from 'form-data'
import axios from 'axios'
import { defineConfig, loadEnv, splitVendorChunkPlugin } from 'vite'
import vue from '@vitejs/plugin-vue'

/** @type {'parallel' | 'serial'} */
const uploadMode = 'serial'

const BUILD_VERSION = 1
const SERVICE_NAME = 'frontend'
const APP_URL = 'http://localhost:4173'

const uploadSourcemapsPlugin = (kibanaServerUrl, apmApiKey) => ({
  name: 'Upload Elastic APM sourcemaps',
  apply: 'build',
  closeBundle: async () => {
    if (!BUILD_VERSION) return

    const distDir = resolve(__dirname, './dist')
    const sourcemapPaths = glob.sync(`${distDir}/**/*.map`)
    const generateFormData = sourcemapPath => {
      const formData = new FormData()
      formData.append('service_name', SERVICE_NAME)
      formData.append('service_version', BUILD_VERSION)
      formData.append('bundle_filepath', APP_URL + sourcemapPath.replace(distDir, '').replace(new RegExp('.map$'), ''))
      formData.append('sourcemap', readFileSync(sourcemapPath, 'utf-8'))

      return formData
    }

    const upload = async (queueIndex, isRecursive) => {
      if (queueIndex > sourcemapPaths.length - 1) return

      const isSuccess = await axios.post(
        `${kibanaServerUrl}/api/apm/sourcemaps`,
        generateFormData(sourcemapPaths[queueIndex]),
        {
          headers: {
            'Content-Type':
              'multipart/form-data; boundary=---abcdefg---',
            'kbn-xsrf': 'true',
            Authorization: `ApiKey ${apmApiKey}`
          }
        }
      )
        .then(() => true)
        .catch(error => {
          console.log('[ERROR]', error.response.data)
          return false
        })

      if (isSuccess) {
        console.log(
          `Uploaded! (${queueIndex + 1}/${sourcemapPaths.length})`
        )
      }

      if (isRecursive)
        await upload(queueIndex + 1, isRecursive)
    }
    
    if (uploadMode === 'parallel') {
      await Promise.all(sourcemapPaths.map((_, index) => upload(index)))
    } else {
      await upload(0, true)
    }
  }
})

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd())

  return {
    plugins: [
      splitVendorChunkPlugin(),
      vue(),
      uploadSourcemapsPlugin(env.VITE_APP_ELASTIC_KIBANA_SERVER_URL, env.VITE_APP_ELASTIC_APM_API_KEY)
    ],
    build: {
      sourcemap: true
    }
  }
})

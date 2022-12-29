'use strict'
const { isObject } = require('../../utils')
/**
 * Log an error message on a failed action on a contentType.
 *
 * @param  {object} options
 * @param  {String} options.contentType - Name of the contentType.
 * @param  {String} options.action - Action that failed.
 *
 * @returns {[]}
 */
const aborted = ({ contentType, action }) => {
  strapi.log.error(
    `Indexing of ${contentType} aborted as the data could not be ${action}`
  )
  return [] // return empty array to avoid indexing entries that might contain sensitive data
}

module.exports = ({ strapi }) => {
  const meilisearchConfig = strapi.config.get('plugin.meilisearch') || {}
  const contentTypeService = strapi.plugin('meilisearch').service('contentType')
  return {
    /**
     * Get the name of the index from Meilisearch in which the contentType content is added.
     *
     * @param {object} options
     * @param {string} options.contentType - ContentType name.
     *
     * @return {String} - Index name
     */
    getIndexNameOfContentType: function ({ contentType }) {
      const collection = contentTypeService.getCollectionName({ contentType })

      const contentTypeConfig = meilisearchConfig[collection] || {}
      return contentTypeConfig.indexName || collection
    },

    /**
     * Get the entries query rule of a content-type that are applied when fetching entries in the Strapi database.
     *
     * @param {object} options
     * @param {string} options.contentType - ContentType name.
     *
     * @return {String} - EntriesQuery rules.
     */
    entriesQuery: function ({ contentType }) {
      const collection = contentTypeService.getCollectionName({ contentType })
      const contentTypeConfig = meilisearchConfig[collection] || {}

      return contentTypeConfig.entriesQuery || {}
    },

    /**
     * Transform contentTypes entries before indexation in Meilisearch.
     *
     * @param {object} options
     * @param {string} options.contentType - ContentType name.
     * @param {Array<Object>} options.entries  - The data to convert. Conversion will use
     * the static method `toSearchIndex` defined in the model definition
     *
     * @return {Promise<Array<Object>>} - Converted or mapped data
     */
    transformEntries: async function ({ contentType, entries = [] }) {
      const collection = contentTypeService.getCollectionName({ contentType })
      const contentTypeConfig = meilisearchConfig[collection] || {}

      try {
        if (
          Array.isArray(entries) &&
          typeof contentTypeConfig?.transformEntry === 'function'
        ) {
          const transformed = await Promise.all(
            entries.map(
              async entry =>
                await contentTypeConfig.transformEntry({
                  entry,
                  contentType,
                })
            )
          )

          if (transformed.length > 0 && !isObject(transformed[0])) {
            return aborted({ contentType, action: 'transformed' })
          }
          return transformed
        }
      } catch (e) {
        strapi.log.error(e)
        return aborted({ contentType, action: 'transformed' })
      }
      return entries
    },

    /**
     * Filter contentTypes entries before indexation in Meilisearch.
     *
     * @param {object} options
     * @param {string} options.contentType - ContentType name.
     * @param {Array<Object>} options.entries  - The data to convert. Conversion will use
     * the static method `toSearchIndex` defined in the model definition
     *
     * @return {Promise<Array<Object>>} - Converted or mapped data
     */
    filterEntries: async function ({ contentType, entries = [] }) {
      const collection = contentTypeService.getCollectionName({ contentType })
      const contentTypeConfig = meilisearchConfig[collection] || {}

      try {
        if (
          Array.isArray(entries) &&
          typeof contentTypeConfig?.filterEntry === 'function'
        ) {
          const filtered = await entries.reduce(
            async (filteredEntries, entry) => {
              const isValid = await contentTypeConfig.filterEntry({
                entry,
                contentType,
              })

              // If the entry does not answers the predicate
              if (!isValid) return filteredEntries

              const syncFilteredEntries = await filteredEntries
              return [...syncFilteredEntries, entry]
            },
            []
          )
          return filtered
        }
      } catch (e) {
        strapi.log.error(e)
        return aborted({ contentType, action: 'filtered' })
      }
      return entries
    },

    /**
     * Returns Meilisearch index settings from model definition.
     *
     * @param {object} options
     * @param {string} options.contentType - ContentType name.
     * @param {Array<Object>} [options.entries]  - The data to convert. Conversion will use

     * @typedef Settings
     * @type {import('meilisearch').Settings}
     * @return {Settings} - Meilisearch index settings
     */
    getSettings: function ({ contentType }) {
      const collection = contentTypeService.getCollectionName({ contentType })
      const contentTypeConfig = meilisearchConfig[collection] || {}

      const settings = contentTypeConfig.settings || {}
      return settings
    },

    /**
     * Return all contentTypes having the provided indexName setting.
     *
     * @param {object} options
     * @param {string} options.indexName - Index in Meilisearch.
     *
     * @returns {string[]} List of contentTypes storing its data in the provided indexName
     */
    listContentTypesWithCustomIndexName: function ({ indexName }) {
      const contentTypes =
        strapi
          .plugin('meilisearch')
          .service('contentType')
          .getContentTypesUid() || []
      const collectionNames = contentTypes.map(contentType =>
        contentTypeService.getCollectionName({ contentType })
      )
      const contentTypeWithIndexName = collectionNames.filter(contentType => {
        const name = this.getIndexNameOfContentType({
          contentType,
        })
        return name === indexName
      })
      return contentTypeWithIndexName
    },

    /**
     * Remove sensitive fields (password, author, etc, ..) from entry.
     *
     * @param {object} options
     * @param {Array<Object>} options.entries - The entries to sanitize
     *
     *
     * @return {Array<Object>} - Entries
     */
    removeSensitiveFields: function ({ entries }) {
      return entries.map(entry => {
        delete entry.createdBy
        delete entry.updatedBy
        return entry
      })
    },

    /**
     * Remove unpublished entries from array of entries
     * unless `publicationState` is set to true.
     *
     * @param {object} options
     * @param {Array<Object>} options.entries - The entries to filter.
     * @param {string} options.contentType - ContentType name.
     *
     * @return {Array<Object>} - Published entries.
     */
    removeUnpublishedArticles: function ({ entries, contentType }) {
      const collection = contentTypeService.getCollectionName({ contentType })
      const contentTypeConfig = meilisearchConfig[collection] || {}

      const entriesQuery = contentTypeConfig.entriesQuery || {}
      try {
        if (
          Array.isArray(entries) &&
          typeof contentTypeConfig?.transformUnpublishedEntry === 'function'
        ) {
          strapi.log.info("TRANSFORMING UNPUB");
          // for(var i = 0; i < entries.length; i++) {
          //   strapi.log.info(JSON.stringify(entries[i], null, 4))
          // }
          const transformed =
            entries.map(
              async entry =>
                contentTypeConfig.transformUnpublishedEntry({
                  entry,
                  contentType,
                })
            )
          if (transformed.length > 0 && !isObject(transformed[0])) {
            return aborted({ contentType, action: 'transformed' })
          }
          if (entriesQuery.publicationState === 'preview') {
            return transformed
          } else {
            return transformed.filter(entry => !(entry?.publishedAt === null))
          }
        }
      } catch (e) {
        strapi.log.error(e)
        return aborted({ contentType, action: 'transformed' })
      }

      if (entriesQuery.publicationState === 'preview') {
        return entries
      } else {
        return entries.filter(entry => !(entry?.publishedAt === null))
      }
    },

    /**
     * Remove language entries.
     * In the plugin entriesQuery, if `locale` is set and not equal to `all`
     * all entries that do not have the specified language are removed.
     *
     * @param {object} options
     * @param {Array<Object>} options.entries - The entries to filter.
     * @param {string} options.contentType - ContentType name.
     *
     * @return {Array<Object>} - Published entries.
     */
    removeLocaleEntries: function ({ entries, contentType }) {
      const collection = contentTypeService.getCollectionName({ contentType })
      const contentTypeConfig = meilisearchConfig[collection] || {}

      const entriesQuery = contentTypeConfig.entriesQuery || {}

      if (!entriesQuery.locale || entriesQuery.locale === 'all') {
        return entries
      } else {
        return entries.filter(entry => entry.locale === entriesQuery.locale)
      }
    },
    /**
     * Set custom meilisearch id.
     * In the plugin entriesQuery, if `customId` is set and not equal to `false`
     * all entries will have a custom id set that will be used for indexing.
     *
     * @param {object} options
     * @param {Array<Object>} options.entries - The entries to filter.
     * @param {string} options.contentType - ContentType name.
     *
     * @return {Array<Object>} - Published entries.
     */
     getCustomId: function ({ entry, contentType }) {
      const collection = contentTypeService.getCollectionName({ contentType })
      const contentTypeConfig = meilisearchConfig[collection] || {}

      if (!contentTypeConfig?.customId || typeof contentTypeConfig?.customId !== 'string') {
        return entry.id;
      } else {
        try {
          return entry[contentTypeConfig.customId]
        } catch (e) {
          strapi.log.error(e)
          return aborted({ contentType, action: 'mapped' })
        }
      }
    },
  }
}

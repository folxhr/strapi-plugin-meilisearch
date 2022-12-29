module.exports = ({ strapi }) => {
  // const store = strapi.plugin('meilisearch').service('store')
  const contentTypeService = strapi.plugin('meilisearch').service('contentType')
  const store = strapi.plugin('meilisearch').service('store')
  return {
    /**
     * Subscribe the content type to all required lifecycles
     *
     * @param  {object} options
     * @param  {string} options.contentType
     *
     * @returns {Promise<object>}
     */
    async subscribeContentType({ contentType }) {
      const contentTypeUid = contentTypeService.getContentTypeUid({
        contentType: contentType,
      })
      await strapi.db.lifecycles.subscribe({
        models: [contentTypeUid],
        async afterCreate(event) {
          const { result } = event
          const meilisearch = strapi
            .plugin('meilisearch')
            .service('meilisearch')

          // Fetch complete entry instead of using result that is possibly
          // partial.
          const entry = await contentTypeService.getEntry({
            contentType: contentTypeUid,
            id: result.id,
            entriesQuery: meilisearch.entriesQuery({ contentType }),
          })

          meilisearch
            .addEntriesToMeilisearch({
              contentType: contentTypeUid,
              entries: [entry],
            })
            .catch(e => {
              strapi.log.error(
                `Meilisearch could not add entry with id: ${result.id}: ${e.message}`
              )
            })
        },
        async afterCreateMany() {
          strapi.log.error(
            `Meilisearch does not work with \`afterCreateMany\` hook as the entries are provided without their id`
          )
        },
        async afterUpdate(event) {
          const { result } = event
          const meilisearch = strapi
            .plugin('meilisearch')
            .service('meilisearch')

          // Fetch complete entry instead of using result that is possibly
          // partial.
          const entry = await contentTypeService.getEntry({
            contentType: contentTypeUid,
            id: result.id,
            entriesQuery: meilisearch.entriesQuery({ contentType }),
          })

          meilisearch
            .updateEntriesInMeilisearch({
              contentType: contentTypeUid,
              entries: [entry],
            })
            .catch(e => {
              strapi.log.error(
                `Meilisearch could not update entry with id: ${result.id}: ${e.message}`
              )
            })
        },
        async afterUpdateMany(event) {
          const meilisearch = strapi
            .plugin('meilisearch')
            .service('meilisearch')

          const nbrEntries = await contentTypeService.numberOfEntries({
            contentType: contentTypeUid,
            where: event.params.where,
          })

          const entries = []
          const BATCH_SIZE = 500

          for (let pos = 0; pos < nbrEntries; pos += BATCH_SIZE) {
            const batch = await contentTypeService.getEntries({
              contentType: contentTypeUid,
              filters: event.params.where,
              start: pos,
              limit: BATCH_SIZE,
            })
            entries.push(...batch)
          }

          meilisearch
            .updateEntriesInMeilisearch({
              contentType: contentTypeUid,
              entries: entries,
            })
            .catch(e => {
              strapi.log.error(
                `Meilisearch could not update the entries: ${e.message}`
              )
            })
        },
        async beforeDelete(event) {
          const { result, params } = event;

          const meilisearch = strapi
            .plugin('meilisearch')
            .service('meilisearch')

          // Fetch complete entry instead of using result that is possibly
          // partial.
          const entry = await contentTypeService.getEntry({
            contentType: contentTypeUid,
            id: result.id,
            entriesQuery: meilisearch.entriesQuery({ contentType }),
          })
          
          event.state = { entry };
        },
        async beforeDeleteMany(event) {
          strapi.log.info("beforeDeleteMany");
          const nbrEntries = await contentTypeService.numberOfEntries({
            contentType: contentTypeUid,
            where: event.params.where,
          })

          const entries = []
          const BATCH_SIZE = 500

          for (let pos = 0; pos < nbrEntries; pos += BATCH_SIZE) {
            const batch = await contentTypeService.getEntries({
              contentType: contentTypeUid,
              filters: event.params.where,
              start: pos,
              limit: BATCH_SIZE,
            })
            entries.push(...batch)
          }
          event.state = { entries };
        },
        async afterDelete(event) {
          const { state } = event
          const { entry } = state
          
          const meilisearch = strapi
            .plugin('meilisearch')
            .service('meilisearch')

          meilisearch
            .deleteEntriesFromMeiliSearch({
              contentType: contentTypeUid,
              entries: [entry],
            })
            .catch(e => {
              strapi.log.error(
                `Meilisearch could not delete entry with id: ${entry.id}: ${e.message}`
              )
            })
        },
        async afterDeleteMany(event) {
          const { state } = event
          const { entries } = state

          const meilisearch = strapi
            .plugin('meilisearch')
            .service('meilisearch')

          meilisearch
            .deleteEntriesFromMeiliSearch({
              contentType: contentTypeUid,
              entries: entries,
            })
            .catch(e => {
              strapi.log.error(
                `Meilisearch could not delete the entries: ${e.message}`
              )
            })
        },
      })

      return store.addListenedContentType({
        contentType: contentTypeUid,
      })
    },
  }
}

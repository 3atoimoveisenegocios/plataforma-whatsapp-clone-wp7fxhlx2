migrate(
  (app) => {
    try {
      var records = app.findRecordsByFilter('properties', '1=1', '-created', 0, 0)
      for (var i = 0; i < records.length; i++) {
        var record = records[i]
        var changed = false

        if (!record.getString('slug')) {
          var name = record.getString('name') || 'imovel'
          var slug = name
            .toLowerCase()
            .replace(/[áàâãä]/g, 'a')
            .replace(/[éèêë]/g, 'e')
            .replace(/[íìîï]/g, 'i')
            .replace(/[óòôõö]/g, 'o')
            .replace(/[úùûü]/g, 'u')
            .replace(/ç/g, 'c')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
          slug = slug + '-' + record.id.substring(0, 6)
          record.set('slug', slug)
          changed = true
        }

        if (!record.getString('youtube_link')) {
          var sampleLinks = [
            'https://www.youtube.com/watch?v=FTQbiNvWvN0',
            'https://www.youtube.com/watch?v=ScMzIvxBSi4',
            'https://www.youtube.com/watch?v=tgbNymZ7vqY',
          ]
          record.set('youtube_link', sampleLinks[i % sampleLinks.length])
          changed = true
        }

        if (changed) {
          app.save(record)
        }
      }
    } catch (_) {}
  },
  (app) => {
    try {
      var records = app.findRecordsByFilter('properties', '1=1', '-created', 0, 0)
      for (var i = 0; i < records.length; i++) {
        var record = records[i]
        record.set('slug', '')
        record.set('youtube_link', '')
        app.save(record)
      }
    } catch (_) {}
  },
)

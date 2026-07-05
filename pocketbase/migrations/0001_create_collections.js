migrate(
  (app) => {
    const instances = new Collection({
      name: 'whatsapp_instances',
      type: 'base',
      listRule: "@request.auth.id != '' && user_id = @request.auth.id",
      viewRule: "@request.auth.id != '' && user_id = @request.auth.id",
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          name: 'user_id',
          type: 'relation',
          required: true,
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
        },
        { name: 'instance_name', type: 'text', required: true },
        {
          name: 'status',
          type: 'select',
          values: ['pending', 'connecting', 'connected', 'disconnected'],
          maxSelect: 1,
        },
        { name: 'qrcode', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_wi_name ON whatsapp_instances (instance_name)'],
    })
    app.save(instances)

    const contacts = new Collection({
      name: 'whatsapp_contacts',
      type: 'base',
      listRule: "@request.auth.id != '' && user_id = @request.auth.id",
      viewRule: "@request.auth.id != '' && user_id = @request.auth.id",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != '' && user_id = @request.auth.id",
      fields: [
        {
          name: 'user_id',
          type: 'relation',
          required: true,
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
        },
        {
          name: 'instance_id',
          type: 'relation',
          required: true,
          collectionId: instances.id,
          maxSelect: 1,
        },
        { name: 'remote_jid', type: 'text', required: true },
        { name: 'name', type: 'text' },
        { name: 'phone', type: 'text' },
        { name: 'last_message', type: 'text' },
        { name: 'last_message_at', type: 'date' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_wc_jid ON whatsapp_contacts (user_id, remote_jid)'],
    })
    app.save(contacts)

    const messages = new Collection({
      name: 'whatsapp_messages',
      type: 'base',
      listRule: "@request.auth.id != '' && user_id = @request.auth.id",
      viewRule: "@request.auth.id != '' && user_id = @request.auth.id",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != '' && user_id = @request.auth.id",
      fields: [
        {
          name: 'user_id',
          type: 'relation',
          required: true,
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
        },
        {
          name: 'instance_id',
          type: 'relation',
          required: true,
          collectionId: instances.id,
          maxSelect: 1,
        },
        {
          name: 'contact_id',
          type: 'relation',
          required: true,
          collectionId: contacts.id,
          maxSelect: 1,
        },
        { name: 'remote_jid', type: 'text', required: true },
        { name: 'message_id', type: 'text', required: true },
        { name: 'direction', type: 'select', values: ['in', 'out'], maxSelect: 1 },
        { name: 'body', type: 'text' },
        { name: 'sent_at', type: 'date' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_wm_id ON whatsapp_messages (message_id)'],
    })
    app.save(messages)
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId('whatsapp_messages'))
    app.delete(app.findCollectionByNameOrId('whatsapp_contacts'))
    app.delete(app.findCollectionByNameOrId('whatsapp_instances'))
  },
)

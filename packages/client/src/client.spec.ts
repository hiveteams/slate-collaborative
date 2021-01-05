import { createEditor, Element, Node, Transforms } from 'slate'
import * as Automerge from 'automerge'
import withAutomerge, { AutomergeOptions } from './withAutomerge'
import { SyncDoc, toJS } from '@hiveteams/collab-bridge'
import AutomergeBackend from '@hiveteams/collab-backend/lib/AutomergeBackend'
import { insertText } from '../../bridge/src/apply/text'

describe('automerge editor client tests', () => {
  const docId = 'test'
  const automergeOptions: AutomergeOptions = {
    docId,
    onError: msg => console.log('Encountered test error', msg)
  }
  const editor = withAutomerge(createEditor(), automergeOptions)
  const automergeBackend = new AutomergeBackend()
  const clientId = 'test-client'

  /**
   * Initialize a basic automerge backend
   */

  // Create a new server automerge connection with a basic send function
  let serverMessages: any[] = []
  automergeBackend.appendDocument(docId, [
    { type: 'paragraph', children: [{ text: 'Hi' }] }
  ])
  automergeBackend.createConnection(clientId, docId, (msg: any) => {
    serverMessages.push(msg)
  })
  automergeBackend.openConnection(clientId)

  // define an editor send function for the clientside automerge editor
  let clientMessages: any[] = []
  editor.send = (msg: any) => {
    clientMessages.push(msg)
  }

  // open the editor connection
  editor.openConnection()

  /**
   * Helper function to flush client messages and send them to the server
   */
  const sendClientMessagesToServer = () => {
    // console.log('clientMessages', JSON.stringify(clientMessages))
    clientMessages.forEach(msg => {
      automergeBackend.receiveOperation(clientId, msg)
    })
    clientMessages = []
  }

  /**
   * Helper function to flush server messages and send them to the client
   */
  const receiveMessagesFromServer = () => {
    console.log('serverMessages', JSON.stringify(serverMessages))
    serverMessages.forEach(msg => {
      editor.receiveOperation(msg)
    })
    serverMessages = []
  }

  afterEach(() => {
    sendClientMessagesToServer()
    receiveMessagesFromServer()
  })

  it('should properly receiveDocument', () => {
    const initialDocData = Automerge.save(automergeBackend.getDocument(docId))
    editor.receiveDocument(initialDocData)

    expect(editor.children.length).toEqual(1)
    const paragraphNode = editor.children[0] as Element
    expect(paragraphNode.type).toEqual('paragraph')
    expect(paragraphNode.children.length).toEqual(1)
    expect(Node.string(paragraphNode)).toEqual('Hi')
  })

  it('should sync insert node operation with server', done => {
    Transforms.insertNodes(editor, {
      type: 'paragraph',
      children: [{ text: 'a' }]
    })

    // ensure that we eventually send a message for the insert_node oepration
    const handle = setInterval(() => {
      sendClientMessagesToServer()
      receiveMessagesFromServer()

      const serverDoc = toJS(automergeBackend.getDocument(docId))
      if (serverDoc.children.length === 2) {
        const paragraphNode = serverDoc.children[1]
        expect(Node.string(paragraphNode)).toEqual('a')
        clearInterval(handle)
        done()
      }
    }, 10)
  })

  it('should sync insert text operation with client', done => {
    const serverDoc = automergeBackend.getDocument(docId)

    const updatedServerDoc = Automerge.change(serverDoc, newServerDoc => {
      insertText(newServerDoc as any, {
        type: 'insert_text',
        path: [1, 0],
        offset: 1,
        text: 'b'
      })
    })
    automergeBackend.documentSetMap[docId].setDoc(docId, updatedServerDoc)

    // ensure that we eventually send a message for the insert_node oepration
    const handle = setInterval(() => {
      sendClientMessagesToServer()
      receiveMessagesFromServer()
      const [, secondParagraph] = editor.children
      console.log(secondParagraph)
      if (Node.string(secondParagraph) === 'ab') {
        clearInterval(handle)
        done()
      }
    }, 10)
  })

  // it('replicate old state error', done => {
  //   serverConnection.close()
  //   serverConnection = new Automerge.Connection(serverDocSet, msg => {
  //     serverMessages.push(msg)
  //   })
  //   serverConnection.open()

  //   sendClientMessagesToServer()
  //   receiveMessagesFromServer()
  // })
})
import { expect, test } from 'bun:test'
import { TCPPublicationReconciler } from './tcpPublicationReconciler'

test('activates desired TCP routes and removes expired or revoked listeners', async () => {
  const active = new Set([20000, 20001])
  let desired = [20001, 20002]
  const deactivated: number[] = []
  const activated: number[] = []
  const reconciler = new TCPPublicationReconciler({
    ingress: {
      get activeListenerPorts() {
        return [...active]
      },
      async activate(port) {
        activated.push(port)
        active.add(port)
      },
      async deactivate(port) {
        deactivated.push(port)
        active.delete(port)
      },
    },
    desiredPorts: () => desired,
  })

  await reconciler.reconcile()
  expect(deactivated).toEqual([20000])
  expect(activated).toEqual([20002])
  expect([...active].sort()).toEqual([20001, 20002])

  desired = []
  await reconciler.reconcile()
  expect([...active]).toEqual([])
})

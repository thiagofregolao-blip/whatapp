import test from 'node:test'
import assert from 'node:assert/strict'
import { nameScore } from '../whatsapp/contacts'

test('Spoken names find the active conversation despite partial or misheard names', () => {
  assert.ok(nameScore('Beto', 'vobeto👻') >= 0.75)
  assert.ok(nameScore('Lise', 'Liceh Sanabria🌱🌾') >= 0.75)
  assert.ok(nameScore('Gustavo', 'Gustavo Marchioro') >= 0.9)
  assert.ok(nameScore('granado', 'M.Granado') >= 0.9)
  assert.ok(nameScore('Andreia', 'Andreia Sapatieri') > nameScore('Andreia', 'Gustavo Marchioro'))
  assert.ok(nameScore('Maria', 'Gustavo Marchioro') < 0.75)
})

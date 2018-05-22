// @flow

import {describe, it} from 'mocha'
import {expect} from 'chai'
import RolesCalc, {INHERITANCE_DEPTH_LIMIT} from '../src/RolesCalc'

describe('RolesCalc', () => {
  it('accepts a role directly matched', () => {
    const rc = new RolesCalc()
    expect(rc.isAuthorized({required: 'foo', actual: 'foo'})).to.equal(true)
  })

  it('rejects a role not directly matched', () => {
    const rc = new RolesCalc()
    expect(rc.isAuthorized({required: 'foo', actual: 'bar'})).to.equal(false)
  })

  it('accepts a role directly matched from an array', () => {
    const rc = new RolesCalc()
    expect(rc.isAuthorized({required: 'foo', actual: ['foo', 'bar']})).to.equal(true)
  })

  it('rejects a role not matched from an array', () => {
    const rc = new RolesCalc()
    expect(rc.isAuthorized({required: 'foo', actual: ['bar', 'baz']})).to.equal(false)
  })

  it('accepts a directly extended role', () => {
    const rc = new RolesCalc()
    rc.role('supervisor').extends('employee')
    expect(rc.isAuthorized({required: 'employee', actual: 'supervisor'})).to.equal(true)
  })

  it('accepts directly extended roles from rest parameters', () => {
    const rc = new RolesCalc()
    rc.role('supervisor').extends('employee', 'person')
    expect(rc.isAuthorized({required: 'employee', actual: 'supervisor'})).to.equal(true)
    expect(rc.isAuthorized({required: 'person', actual: 'supervisor'})).to.equal(true)
  })

  it('accepts directly extended roles from an array', () => {
    const rc = new RolesCalc()
    rc.role('supervisor').extends(['employee', 'person'])
    expect(rc.isAuthorized({required: 'employee', actual: 'supervisor'})).to.equal(true)
    expect(rc.isAuthorized({required: 'person', actual: 'supervisor'})).to.equal(true)
  })

  it('rejects roles not extended', () => {
    const rc = new RolesCalc()
    rc.role('supervisor').extends('employee', 'person')
    rc.role('diety').extends('owner')
    expect(rc.isAuthorized({required: 'owner', actual: 'supervisor'})).to.equal(false)
    expect(rc.isAuthorized({required: 'owner', actual: ['supervisor', 'irrelevant']})).to.equal(false)
  })

  it('accepts a transitively extended role', () => {
    const rc = new RolesCalc()
    rc.role('supervisor').extends('employee')
    rc.role('owner').extends('supervisor')
    expect(rc.isAuthorized({required: 'employee', actual: 'owner'})).to.equal(true)
  })

  it('accepts a read permission extended by a write permission', () => {
    const rc = new RolesCalc()
    expect(rc.isAuthorized({required: 'foo:read', actual: 'foo:write'})).to.equal(true)
  })

  it('obeys a writeExtendsRead:false setting', () => {
    const rc = new RolesCalc({writeExtendsRead: false})
    expect(rc.isAuthorized({required: 'foo:read', actual: 'foo:write'})).to.equal(false)
  })

  it('accepts a specific permission extended by a general permission', () => {
    const rc = new RolesCalc()
    expect(rc.isAuthorized({required: 'couch:burn', actual: 'couch'})).to.equal(true)
    expect(rc.isAuthorized({required: 'couch:sweep', actual: 'couch'})).to.equal(true)
  })

  it('correctly interprets the "write extends read" rule at the end of a transitive chain', () => {
    const rc = new RolesCalc()
    rc.role('admin').extends('simulations:write')
    rc.role('simulations:write').extends('loadProfiles:write')
    expect(rc.isAuthorized({required: 'loadProfiles:read', actual: 'admin'})).to.equal(true) // admin > simulations:write > loadProfiles:write > loadProfiles:read
    expect(rc.isAuthorized({required: 'loadProfiles:falsify', actual: 'admin'})).to.equal(false) // write does not extend falsify
  })

  it('correctly interprets the "write extends read" rule in the middle of a transitive chain', () => {
    const rc = new RolesCalc()
    rc.role('admin').extends('simulations:write')
    rc.role('simulations:read').extends('loadProfiles:read')
    expect(rc.isAuthorized({required: 'loadProfiles:read', actual: 'admin'})).to.equal(true) // admin > simulations:write > loadProfiles:write > loadProfiles:read
    expect(rc.isAuthorized({required: 'loadProfiles:read', actual: 'loadProfiles:archive'})).to.equal(false)
  })

  it('correctly interprets the "general extends specific" rule in the middle of a transitive chain', () => {
    const rc = new RolesCalc()
    rc.role('admin').extends('foo')
    rc.role('foo:read').extends('bar:read')
    expect(rc.isAuthorized({required: 'bar:read', actual: 'admin'})).to.equal(true) // admin > simulations:write > loadProfiles:write > loadProfiles:read
    expect(rc.isAuthorized({required: 'bar:eat', actual: 'admin'})).to.equal(false)
  })

  it('super evil challenge', () => {
    const rc = new RolesCalc({alwaysAllow: 'admin'})
    rc.role('blah').extends('admin')
    rc.role('foo:read').extends('bar:read')
    rc.role('bar:read').extends('baz:write')
    rc.role('baz:read').extends('qux')
    rc.role('qux').extends('glorm')
    rc.role('glorm:write').extends('flok')
    expect(rc.isAuthorized({required: 'flok', actual: 'admin'})).to.equal(true)
    expect(rc.isAuthorized({required: 'flok', actual: 'blah'})).to.equal(true)
  })

  it('accepts properly configured global admin permissions', () => {
    const rc = new RolesCalc({alwaysAllow: ['admin', 'owner']})
    expect(rc.isAuthorized({required: 'money:embezzle', actual: 'admin'})).to.equal(true)
    expect(rc.isAuthorized({required: 'intern:demean', actual: 'owner'})).to.equal(true)
  })

  it('rejects global admin permissions that have not been configured', () => {
    const rc = new RolesCalc({alwaysAllow: ['admin', 'owner']})
    expect(rc.isAuthorized({required: 'money:waste', actual: 'manager'})).to.equal(false)
  })

  const roleForLevel = level => `level${level}`

  it(`handles ${INHERITANCE_DEPTH_LIMIT} levels of inheritance`, () => {
    const rc = new RolesCalc()
    for (let level = 0; level < INHERITANCE_DEPTH_LIMIT; ++level) {
      rc.role(roleForLevel(level + 1)).extends(roleForLevel(level))
    }
    expect(rc.isAuthorized({required: roleForLevel(0), actual: roleForLevel(INHERITANCE_DEPTH_LIMIT)})).to.equal(true)
  })

  it(`throws when resolving more than ${INHERITANCE_DEPTH_LIMIT} levels of inheritance`, () => {
    // Build a 21 level inheritance hierarchy, which will exceed the limit of 20
    const TEST_LEVEL = INHERITANCE_DEPTH_LIMIT + 1
    const rc = new RolesCalc()
    for (let level = 0; level < TEST_LEVEL; ++level) {
      rc.role(roleForLevel(level + 1)).extends(roleForLevel(level))
    }
    expect(() => rc.isAuthorized({required: roleForLevel(0), actual: roleForLevel(TEST_LEVEL)})).to.throw()
  })

  it('allows a role to be added redundantly', () => {
    const rc = new RolesCalc()
    rc.role('supervisor').extends('manager')
    rc.role('supervisor').extends('manager')
    expect(rc.isAuthorized({required: 'manager', actual: 'supervisor'})).to.equal(true)
  })

  it('allows a role to be added redundantly', () => {
    const rc = new RolesCalc()
    rc.role('supervisor').extends('manager')
    rc.role('supervisor').extends('manager')
    expect(rc.isAuthorized({required: 'manager', actual: 'supervisor'})).to.equal(true)
  })

  it('handles inheritance trees with redundant paths to the same role', () => {
    const rc = new RolesCalc()
    rc.role('owner').extends('manager')
    rc.role('manager').extends('employee')
    // redundant, but should still work as expected
    rc.role('owner').extends('employee')
    expect(rc.isAuthorized({required: 'employee', actual: 'manager'})).to.equal(true)
    expect(rc.isAuthorized({required: 'employee', actual: 'owner'})).to.equal(true)
    expect(rc.isAuthorized({required: 'employee', actual: 'customer'})).to.equal(false)
  })

  describe('pruneRedundantRoles', () => {
    it('does not change non-redundant roles', () => {
      const rc = new RolesCalc()
      expect(rc.pruneRedundantRoles(['foo', 'bar'])).to.deep.equal(['foo', 'bar'])
    })
    it('prunes redundant roles based on defined inheritance', () => {
      const rc = new RolesCalc()
      rc.role('owner').extends('manager')
      rc.role('manager').extends('employee')
      expect(rc.pruneRedundantRoles(['employee', 'manager', 'owner', 'baker'])).to.deep.equal(['owner', 'baker'])
    })
    it('prunes redundant roles based on resource:write > resource:read inheritance', () => {
      const rc = new RolesCalc()
      expect(rc.pruneRedundantRoles(['foo:read', 'foo:write', 'baker'])).to.deep.equal(['foo:write', 'baker'])
    })
    it('prunes redundant roles based on resource > resource:action inheritance', () => {
      const rc = new RolesCalc()
      expect(rc.pruneRedundantRoles(['foo:read', 'foo:write', 'foo:burn', 'foo', 'baker'])).to.deep.equal(['foo', 'baker'])
    })
  })

  describe('explodeResourceActionRole', () => {
    it('explodes resource:action roles that are extended by other roles', () => {
      const rc = new RolesCalc()
      expect(rc._explodeResourceActionRole('foo:bar')).to.deep.equal(['foo'])
    })

    it('explodes resource:read role into resource:write role when write extends read', () => {
      const rc = new RolesCalc()
      expect(rc._explodeResourceActionRole('foo:read')).to.deep.equal(['foo', 'foo:write'])
    })

    it('does not explode resource:read role into resource:write roles when write does not extend read', () => {
      const rc = new RolesCalc({writeExtendsRead: false})
      expect(rc._explodeResourceActionRole('foo:read')).to.deep.equal(['foo'])
    })

    it('does not explode roles that do not follow the resource:action pattern', () => {
      const rc = new RolesCalc()
      for (let pattern of [':foo', ':', 'baz', ':foo:bar', 'foo:bar:', 'foo:bar:baz']) {
        expect(rc._explodeResourceActionRole(pattern)).to.deep.equal([])
      }
    })
  })
})

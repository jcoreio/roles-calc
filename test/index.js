// @flow

import {describe, it} from 'mocha'
import {expect} from 'chai'
import RolesCalc, {INHERITANCE_DEPTH_LIMIT} from '../src/RolesCalc'

describe('RolesCalc', () => {
  it("throws an error if resourceActionSeparator is not of length 1", () => {
    expect(() => new RolesCalc({resourceActionSeparator: ''})).to.throw(Error)
    expect(() => new RolesCalc({resourceActionSeparator: 'ab'})).to.throw(Error)
  })
  it("defaults resourceActionSeparator to ':'", () => {
    const rc = new RolesCalc()
    expect(rc.isAuthorized({required: `foo:read`, actual: `foo:write`})).to.equal(true)
  })
  function testForSeparator(sep: string) {
    describe(`with separator: ${sep}`, () => {
      it('accepts a role directly matched', () => {
        const rc = new RolesCalc({resourceActionSeparator: sep})
        expect(rc.isAuthorized({required: 'foo', actual: 'foo'})).to.equal(true)
      })

      it('rejects a role not directly matched', () => {
        const rc = new RolesCalc({resourceActionSeparator: sep})
        expect(rc.isAuthorized({required: 'foo', actual: 'bar'})).to.equal(false)
      })

      it('accepts a role directly matched from an array', () => {
        const rc = new RolesCalc({resourceActionSeparator: sep})
        expect(rc.isAuthorized({required: 'foo', actual: ['foo', 'bar']})).to.equal(true)
      })

      it('rejects a role not matched from an array', () => {
        const rc = new RolesCalc({resourceActionSeparator: sep})
        expect(rc.isAuthorized({required: 'foo', actual: ['bar', 'baz']})).to.equal(false)
      })

      it('accepts a directly extended role', () => {
        const rc = new RolesCalc({resourceActionSeparator: sep})
        rc.role('supervisor').extends('employee')
        expect(rc.isAuthorized({required: 'employee', actual: 'supervisor'})).to.equal(true)
      })

      it('accepts a directly extended role', () => {
        const rc = new RolesCalc({resourceActionSeparator: sep})
        rc.role('supervisor').extends('employee')
        expect(rc.isAuthorized({required: 'employee', actual: 'supervisor'})).to.equal(true)
      })

      it('accepts directly extended roles from rest parameters', () => {
        const rc = new RolesCalc({resourceActionSeparator: sep})
        rc.role('supervisor').extends('employee', 'person')
        expect(rc.isAuthorized({required: 'employee', actual: 'supervisor'})).to.equal(true)
        expect(rc.isAuthorized({required: 'person', actual: 'supervisor'})).to.equal(true)
      })

      it('accepts directly extended roles from an array', () => {
        const rc = new RolesCalc({resourceActionSeparator: sep})
        rc.role('supervisor').extends(['employee', 'person'])
        expect(rc.isAuthorized({required: 'employee', actual: 'supervisor'})).to.equal(true)
        expect(rc.isAuthorized({required: 'person', actual: 'supervisor'})).to.equal(true)
      })

      it('rejects roles not extended', () => {
        const rc = new RolesCalc({resourceActionSeparator: sep})
        rc.role('supervisor').extends('employee', 'person')
        rc.role('diety').extends('owner')
        expect(rc.isAuthorized({required: 'owner', actual: 'supervisor'})).to.equal(false)
        expect(rc.isAuthorized({required: 'owner', actual: ['supervisor', 'irrelevant']})).to.equal(false)
      })

      it('accepts a transitively extended role', () => {
        const rc = new RolesCalc({resourceActionSeparator: sep})
        rc.role('supervisor').extends('employee')
        rc.role('owner').extends('supervisor')
        expect(rc.isAuthorized({required: 'employee', actual: 'owner'})).to.equal(true)
      })

      it('accepts a read permission extended by a write permission', () => {
        const rc = new RolesCalc({resourceActionSeparator: sep})
        expect(rc.isAuthorized({required: `foo${sep}read`, actual: `foo${sep}write`})).to.equal(true)
      })

      it('obeys a writeExtendsRead:false setting', () => {
        const rc = new RolesCalc({resourceActionSeparator: sep, writeExtendsRead: false})
        expect(rc.isAuthorized({required: `foo${sep}read`, actual: `foo${sep}write`})).to.equal(false)
      })

      it('accepts a specific permission extended by a general permission', () => {
        const rc = new RolesCalc({resourceActionSeparator: sep})
        expect(rc.isAuthorized({required: `couch${sep}burn`, actual: 'couch'})).to.equal(true)
        expect(rc.isAuthorized({required: `couch${sep}sweep`, actual: 'couch'})).to.equal(true)
      })

      it('correctly interprets the "write extends read" rule at the end of a transitive chain', () => {
        const rc = new RolesCalc({resourceActionSeparator: sep})
        rc.role('admin').extends(`simulations${sep}write`)
        rc.role(`simulations${sep}write`).extends(`loadProfiles${sep}write`)
        expect(rc.isAuthorized({required: `loadProfiles${sep}read`, actual: 'admin'})).to.equal(true) // admin > simulations:write > loadProfiles:write > loadProfiles:read
        expect(rc.isAuthorized({required: `loadProfiles${sep}falsify`, actual: 'admin'})).to.equal(false) // write does not extend falsify
      })

      it('correctly interprets the "write extends read" rule in the middle of a transitive chain', () => {
        const rc = new RolesCalc({resourceActionSeparator: sep})
        rc.role('admin').extends(`simulations${sep}write`)
        rc.role(`simulations${sep}read`).extends(`loadProfiles${sep}read`)
        expect(rc.isAuthorized({required: `loadProfiles${sep}read`, actual: 'admin'})).to.equal(true) // admin > simulations:write > loadProfiles:write > loadProfiles:read
        expect(rc.isAuthorized({required: `loadProfiles${sep}read`, actual: `loadProfiles${sep}archive`})).to.equal(false)
      })

      it('correctly interprets the "general extends specific" rule in the middle of a transitive chain', () => {
        const rc = new RolesCalc({resourceActionSeparator: sep})
        rc.role('admin').extends('foo')
        rc.role(`foo${sep}read`).extends(`bar${sep}read`)
        expect(rc.isAuthorized({required: `bar${sep}read`, actual: 'admin'})).to.equal(true) // admin > simulations:write > loadProfiles:write > loadProfiles:read
        expect(rc.isAuthorized({required: `bar${sep}eat`, actual: 'admin'})).to.equal(false)
      })

      it('super evil challenge', () => {
        const rc = new RolesCalc({alwaysAllow: 'admin', resourceActionSeparator: sep})
        rc.role('blah').extends('admin')
        rc.role(`foo${sep}read`).extends(`bar${sep}read`)
        rc.role(`bar${sep}read`).extends(`baz${sep}write`)
        rc.role(`baz${sep}read`).extends('qux')
        rc.role('qux').extends('glorm')
        rc.role(`glorm${sep}write`).extends('flok')
        expect(rc.isAuthorized({required: 'flok', actual: 'admin'})).to.equal(true)
        expect(rc.isAuthorized({required: 'flok', actual: 'blah'})).to.equal(true)
      })

      it('accepts properly configured global admin permissions', () => {
        const rc = new RolesCalc({resourceActionSeparator: sep, alwaysAllow: ['admin', 'owner']})
        expect(rc.isAuthorized({required: `money${sep}embezzle`, actual: 'admin'})).to.equal(true)
        expect(rc.isAuthorized({required: `intern${sep}demean`, actual: 'owner'})).to.equal(true)
      })

      it('rejects global admin permissions that have not been configured', () => {
        const rc = new RolesCalc({resourceActionSeparator: sep, alwaysAllow: ['admin', 'owner']})
        expect(rc.isAuthorized({required: `money${sep}waste`, actual: 'manager'})).to.equal(false)
      })

      const roleForLevel = level => `level${level}`

      it(`handles ${INHERITANCE_DEPTH_LIMIT} levels of inheritance`, () => {
        const rc = new RolesCalc({resourceActionSeparator: sep})
        for (let level = 0; level < INHERITANCE_DEPTH_LIMIT; ++level) {
          rc.role(roleForLevel(level + 1)).extends(roleForLevel(level))
        }
        expect(rc.isAuthorized({required: roleForLevel(0), actual: roleForLevel(INHERITANCE_DEPTH_LIMIT)})).to.equal(true)
      })

      it(`throws when resolving more than ${INHERITANCE_DEPTH_LIMIT} levels of inheritance`, () => {
        // Build a 21 level inheritance hierarchy, which will exceed the limit of 20
        const TEST_LEVEL = INHERITANCE_DEPTH_LIMIT + 1
        const rc = new RolesCalc({resourceActionSeparator: sep})
        for (let level = 0; level < TEST_LEVEL; ++level) {
          rc.role(roleForLevel(level + 1)).extends(roleForLevel(level))
        }
        expect(() => rc.isAuthorized({required: roleForLevel(0), actual: roleForLevel(TEST_LEVEL)})).to.throw()
      })

      it('allows a role to be added redundantly', () => {
        const rc = new RolesCalc({resourceActionSeparator: sep})
        rc.role('supervisor').extends('manager')
        rc.role('supervisor').extends('manager')
        expect(rc.isAuthorized({required: 'manager', actual: 'supervisor'})).to.equal(true)
      })

      it('allows a role to be added redundantly', () => {
        const rc = new RolesCalc({resourceActionSeparator: sep})
        rc.role('supervisor').extends('manager')
        rc.role('supervisor').extends('manager')
        expect(rc.isAuthorized({required: 'manager', actual: 'supervisor'})).to.equal(true)
      })

      it('handles inheritance trees with redundant paths to the same role', () => {
        const rc = new RolesCalc({resourceActionSeparator: sep})
        rc.role('owner').extends('manager')
        rc.role('manager').extends('employee')
        // redundant, but should still work as expected
        rc.role('owner').extends('employee')
        expect(rc.isAuthorized({required: 'employee', actual: 'manager'})).to.equal(true)
        expect(rc.isAuthorized({required: 'employee', actual: 'owner'})).to.equal(true)
        expect(rc.isAuthorized({required: 'employee', actual: 'customer'})).to.equal(false)
      })

      it('infers that parent:action > child:action when parent > child', () => {
        const rc = new RolesCalc({resourceActionSeparator: sep})
        rc.role('parent').extends('child')
        expect(rc.isAuthorized({required: `child${sep}read`, actual: `parent${sep}read`})).to.equal(true)
        expect(rc.isAuthorized({required: `child${sep}read`, actual: 'parent'})).to.equal(true)
      })

      it('infers that parent:action does not extend child:different_action when parent > child', () => {
        const rc = new RolesCalc({resourceActionSeparator: sep})
        rc.role('parent').extends('child')
        expect(rc.isAuthorized({required: `child${sep}read`, actual: `parent${sep}feed`})).to.equal(false)
      })

      describe('pruneRedundantRoles', () => {
        it('does not change non-redundant roles', () => {
          const rc = new RolesCalc({resourceActionSeparator: sep})
          expect(rc.pruneRedundantRoles(['foo', 'bar'])).to.deep.equal(['foo', 'bar'])
        })
        it('prunes redundant roles based on defined inheritance', () => {
          const rc = new RolesCalc({resourceActionSeparator: sep})
          rc.role('owner').extends('manager')
          rc.role('manager').extends('employee')
          expect(rc.pruneRedundantRoles(['employee', 'manager', 'owner', 'baker'])).to.deep.equal(['owner', 'baker'])
        })
        it('prunes redundant roles based on resource:write > resource:read inheritance', () => {
          const rc = new RolesCalc({resourceActionSeparator: sep})
          expect(rc.pruneRedundantRoles([`foo${sep}read`, `foo${sep}write`, 'baker'])).to.deep.equal([`foo${sep}write`, 'baker'])
        })
        it('prunes redundant roles based on resource > resource:action inheritance', () => {
          const rc = new RolesCalc({resourceActionSeparator: sep})
          expect(rc.pruneRedundantRoles([`foo${sep}read`, `foo${sep}write`, `foo${sep}burn`, 'foo', 'baker'])).to.deep.equal(['foo', 'baker'])
        })
      })

      describe('explodeResourceActionRole', () => {
        it(`explodes resource${sep}action roles that are extended by other roles`, () => {
          const rc = new RolesCalc({resourceActionSeparator: sep})
          expect(rc._explodeResourceActionRole(`foo${sep}bar`)).to.deep.equal(['foo'])
        })

        it(`explodes resource${sep}read role into resource${sep}write role when write extends read`, () => {
          const rc = new RolesCalc({resourceActionSeparator: sep})
          expect(rc._explodeResourceActionRole(`foo${sep}read`)).to.deep.equal(['foo', `foo${sep}write`])
        })

        it(`does not explode resource${sep}read role into resource${sep}write roles when write does not extend read`, () => {
          const rc = new RolesCalc({resourceActionSeparator: sep, writeExtendsRead: false})
          expect(rc._explodeResourceActionRole(`foo${sep}read`)).to.deep.equal(['foo'])
        })

        it('does not explode roles that do not follow the resource:action pattern', () => {
          const rc = new RolesCalc({resourceActionSeparator: sep})
          for (let pattern of [`${sep}foo`, sep, 'baz', `${sep}foo${sep}bar`, `foo${sep}bar${sep}`, `foo${sep}bar${sep}baz`]) {
            expect(rc._explodeResourceActionRole(pattern)).to.deep.equal([])
          }
        })
      })
    })
  }
  testForSeparator(':')
  testForSeparator('_')
})

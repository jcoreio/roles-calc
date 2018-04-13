// @flow

import flatten from 'lodash.flatten'
import uniq from 'lodash.uniq'

type RoleModifier = {
  extends: (...childRoles: Array<string | Array<string>>) => void,
}

export const INHERITANCE_DEPTH_LIMIT = 20

export default class RolesCalc {

  _alwaysAllow: Set<string>
  _writeExtendsRead: boolean // defaults to true

  /** relationships, as defined by the user */
  _childRolesToParentRoles: Map<string, Set<string>> = new Map()

  _childRolesToParentRolesFlattened: Map<string, Set<string>> = new Map()

  constructor(opts: {alwaysAllow?: ?string | ?Array<string>, writeExtendsRead?: ?boolean} = {}) {
    const {alwaysAllow, writeExtendsRead} = opts
    this._alwaysAllow = new Set(toArray(alwaysAllow || []))
    this._writeExtendsRead = writeExtendsRead == null ? true : !!writeExtendsRead // default to true
  }

  role(parentRoles: string | Array<string>): RoleModifier {
    return {
      extends: (...childRoles: Array<string | Array<string>>) => {
        const childRolesFlat = flatten(childRoles)
        for (let parentRole of toArray(parentRoles)) {
          for (let childRole of childRolesFlat) {
            let parentRolesForChildRole: ?Set<string> = this._childRolesToParentRoles.get(childRole)
            if (!parentRolesForChildRole) {
              parentRolesForChildRole = new Set()
              this._childRolesToParentRoles.set(childRole, parentRolesForChildRole)
            }
            if (!parentRolesForChildRole.has(parentRole)) {
              parentRolesForChildRole.add(parentRole)
              this._childRolesToParentRolesFlattened.clear()
            }
          }
        }
      }
    }
  }

  isAuthorized(args: {required: string, actual: string | Array<string>}): boolean {
    const {required, actual} = args
    const actualArr = toArray(actual)

    // If the user has any "always allowed" roles, return true
    if (this._alwaysAllow.size) {
      for (let actualRole of actualArr) {
        if (this._alwaysAllow.has(actualRole))
          return true
      }
    }

    // Look up a flattened set of roles that extend the required role
    const parentRoles: Set<string> = this._getParentRolesSet(required)
    for (let actualRole of actualArr) {
      if (actualRole === required)
        return true
      if (parentRoles.has(actualRole))
        return true
    }

    return false
  }

  /**
   * Removes roles that are redundant due to an inheritance relationship. For example:
   * rc.role('manager').extends('employee')
   * rc.pruneRedundantRoles(['manager', 'employee']) -> ['manager']
   * rc.pruneRedundantRoles(['foo:write', 'foo:read']) -> ['foo:write']
   * rc.pruneRedundantRoles(['foo', 'foo:write']) -> ['foo']
   * @param roles
   */
  pruneRedundantRoles(roles: Array<string>): Array<string> {
    const pruned = uniq(roles)
    for (let childIdx = 0; childIdx < pruned.length; ++childIdx) {
      const childRole = pruned[childIdx]
      const parentRoles: Set<string> = this._getParentRolesSet(childRole)
      if (parentRoles.size) {
        const parentRoleIdx = pruned.findIndex((value, index) => index !== childIdx && parentRoles.has(value))
        if (parentRoleIdx >= 0) {
          // we found a role that is a parent of this child role, so the child role is redundant
          // and can be removed. Post-decrement childIdx when we remove an element, so that
          // after it's incremented at the end of the for loop, we check the element that slid left
          // when we spliced the array
          pruned.splice(childIdx--, 1)
        }
      }
    }
    return pruned
  }

  _getParentRolesSet(role: string): Set<string> {
    let parentRoles: ?Set<string> = this._childRolesToParentRolesFlattened.get(role)
    if (!parentRoles) {
      parentRoles = this._calcParentRolesSet(role)
      this._childRolesToParentRolesFlattened.set(role, parentRoles)
    }
    return parentRoles
  }

  _calcParentRolesSet(role: string): Set<string> {
    let addedRoles: Array<string> = [role]
    const roles: Set<string> = new Set()

    let sanityCount = INHERITANCE_DEPTH_LIMIT + 1
    do {
      if (!sanityCount--)
        throw new Error(`could not flatten roles: inheritance depth of ${INHERITANCE_DEPTH_LIMIT} levels was exceeded`)

      let addedRolesThisPass: Array<string> = []

      for (let addedRole of addedRoles) {
        const addIfNotPresent = (role: string) => {
          if (!roles.has(role)) {
            addedRolesThisPass.push(role)
            roles.add(role)
          }
        }

        // process 'resource:write' > 'resource:read' and 'resource' > 'resource:action' inheritances
        this._explodeResourceActionRole(addedRole).forEach(addIfNotPresent)

        // process inheritance links added by calls to rc.role('foo').extends('bar')
        const userConfiguredParentRoles: ?Set<string> = this._childRolesToParentRoles.get(addedRole)
        if (userConfiguredParentRoles)
          userConfiguredParentRoles.forEach(addIfNotPresent)
      }

      addedRoles = addedRolesThisPass
    } while (addedRoles.length)
    return roles
  }

  /**
   * Calculates a set of less-restricted roles that would satisfy a more-restricted
   * query. For example, if a 'site:read' role is required, a 'site:write' or
   * 'site' role would satisfy the requirement:
   *
   * explodeResourceActionRole('site:read') -> 'site:read', 'site:write', 'site'
   * explodeResourceActionRole('site:write') -> 'site:write', 'site'
   * explodeResourceActionRole('site') -> 'site'
   *
   * @param role input role
   * @returns Set of roles that would satisfy the requirement of the input role
   */
  _explodeResourceActionRole(role: string): Array<string> {
    const result = []
    const match = role.match(/^([^:]+):([^:]+)$/)
    if (match) {
      const resource = match[1]
      const action = match[2]
      result.push(resource)
      if (this._writeExtendsRead && 'read' === action)
        result.push(`${resource}:write`)
    }
    return result
  }
}

function toArray(maybeArray: string | Array<string>): Array<string> {
  return Array.isArray(maybeArray) ? maybeArray : [maybeArray]
}

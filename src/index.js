// @flow

type RoleModifier<Role: string> = {
  extends: (...childRoles: Array<Roles<Role>>) => void,
}

export type Roles<Role: string> = $ReadOnlyArray<Role> | Set<Role> | $ReadOnly<{[role: Role]: boolean}> | Role

export function rolesToSet<Role: string>(roles: Roles<Role>): Set<Role> {
  if (roles instanceof Set) return roles
  return new Set(rolesToIterable(roles))
}

export function rolesToIterable<Role: string>(roles: Roles<Role>): Iterable<Role> {
  if (!roles) throw new Error('roles must be truthy')
  if (roles instanceof Set || Array.isArray(roles)) return roles
  if (typeof roles === 'string') return [roles]
  const finalRoles = roles
  return Object.keys(roles).filter(role => finalRoles[role])
}

export function rolesToObject<Role: string>(roles: Roles<Role>): {[role: Role]: boolean} {
  const result = {}
  for (let role of rolesToIterable(roles)) {
    result[role] = true
  }
  return result
}

export const INHERITANCE_DEPTH_LIMIT = 20

export default class RolesCalc<Role: string> {
  _resourceActionRegex: RegExp
  _resourceActionSeparator: string
  _alwaysAllow: Set<Role>
  _writeExtendsRead: boolean // defaults to true

  /** relationships, as defined by the user */
  _childRolesToParentRoles: Map<Role, Set<Role>> = new Map()

  _childRolesToParentRolesFlattened: Map<Role, Set<Role>> = new Map()

  static rolesToSet = rolesToSet
  static rolesToObject = rolesToObject
  static rolesToIterable = rolesToIterable

  constructor(opts: {
    alwaysAllow?: ?Roles<Role>,
    writeExtendsRead?: ?boolean,
    resourceActionSeparator?: ?Role,
  } = {}) {
    const {alwaysAllow, writeExtendsRead, resourceActionSeparator} = opts
    if (resourceActionSeparator != null && resourceActionSeparator.length !== 1) {
      throw new Error('resourceActionSeparator must be a single character')
    }
    this._alwaysAllow = new rolesToSet(alwaysAllow || [])
    this._writeExtendsRead = writeExtendsRead == null ? true : !!writeExtendsRead // default to true
    this._resourceActionSeparator = resourceActionSeparator || ':'
    const sep = this._resourceActionSeparator
    this._resourceActionRegex = new RegExp(`^([^${sep}]+)${sep}([^${sep}]+)$`)
  }

  role(parentRoles: Roles<Role>): RoleModifier<Role> {
    return {
      extends: (...childRoles: Array<Roles<Role>>) => {
        for (let parentRole of rolesToIterable(parentRoles)) {
          for (let arg of childRoles) {
            for (let childRole of rolesToIterable(arg)) {
              let parentRolesForChildRole: ?Set<Role> = this._childRolesToParentRoles.get(childRole)
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
  }

  isAuthorized(args: {required: Role, actual: Roles<Role>}): boolean {
    const {required, actual} = args

    // Look up a flattened set of roles that extend the required role
    const parentRoles: Set<Role> = this._getParentRolesSet(required)
    for (let actualRole of rolesToIterable(actual)) {
      if (actualRole === required || parentRoles.has(actualRole))
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
  pruneRedundantRolesSet(roles: Roles<Role>): Set<Role> {
    const pruned = rolesToSet(roles)
    for (let childRole of pruned) {
      for (let parentRole of this.getParentRolesSet(childRole)) {
        if (pruned.has(parentRole)) {
          pruned.delete(childRole)
          break
        }
      }
    }
    return pruned
  }

  pruneRedundantRoles(roles: Roles<Role>): Array<Role> {
    return Array.from(this.pruneRedundantRolesSet(roles))
  }

  _getParentRolesSet(role: Role): Set<Role> {
    let parentRoles: ?Set<Role> = this._childRolesToParentRolesFlattened.get(role)
    if (!parentRoles) {
      parentRoles = this._calcParentRolesSet(role)
      this._childRolesToParentRolesFlattened.set(role, parentRoles)
    }
    return parentRoles
  }

  getParentRolesSet(role: Role): Set<Role> {
    return new Set(this._getParentRolesSet(role))
  }

  getRoleAndParentRolesSet(role: Role): Set<Role> {
    const result = this.getParentRolesSet(role)
    result.add(role)
    return result
  }

  _calcParentRolesSet(role: Role): Set<Role> {
    const {action} = this._toResourceAndAction(role)

    const roles: Set<Role> = new Set(this._alwaysAllow)
    roles.add(role)
    let addedRoles: Set<Role> = new Set(roles)

    let sanityCount = INHERITANCE_DEPTH_LIMIT + 1
    while (addedRoles.size) {
      if (!sanityCount--)
        throw new Error(`could not flatten roles: inheritance depth of ${INHERITANCE_DEPTH_LIMIT} levels was exceeded`)

      let addedRolesThisPass: Set<Role> = new Set()

      for (let addedRole of addedRoles) {
        const addIfNotPresent = (role: any) => {
          if (!roles.has(role)) {
            addedRolesThisPass.add(role)
            roles.add(role)
          }
        }

        // process 'resource:write' > 'resource:read' and 'resource' > 'resource:action' inheritances
        this._explodeResourceActionRole(addedRole).forEach(addIfNotPresent)

        // process inheritance links added by calls to rc.role('foo').extends('bar')
        const userConfiguredParentRoles: ?Set<Role> = this._childRolesToParentRoles.get(addedRole)
        if (userConfiguredParentRoles) {
          userConfiguredParentRoles.forEach((parentRole: Role) => {
            addIfNotPresent(parentRole)
            if (action && !this._toResourceAndAction(parentRole).action) {
              // This is a parent > child relationship, and we're looking for a child:action
              // permission. In this case, parent:action > child:action
              addIfNotPresent(`${parentRole}${this._resourceActionSeparator}${action}`)
            }
          })
        }
      }

      addedRoles = addedRolesThisPass
    }
    roles.delete(role)
    return roles
  }

  /**
   * Calculates a set of less-restricted roles that would satisfy a more-restricted
   * query. For example, if a 'site:read' role is required, a 'site:write' or
   * 'site' role would satisfy the requirement:
   *
   * explodeResourceActionRole('site:read') -> 'site:write', 'site'
   * explodeResourceActionRole('site:write') -> 'site'
   *
   * @param role input role
   * @returns Set of roles that would satisfy the requirement of the input role
   */
  _explodeResourceActionRole(role: Role): Set<Role> {
    const result: Set<Role> = new Set()
    const {resource, action} = this._toResourceAndAction(role)
    if (resource && action) {
      result.add((resource: any))
      if (this._writeExtendsRead && 'read' === action)
        result.add((`${resource}${this._resourceActionSeparator}write`: any))
    }
    return result
  }

  _toResourceAndAction(role: Role): {resource: ?Role, action: ?Role} {
    const match = role.match(this._resourceActionRegex)
    return {
      resource: match ? match[1] : null,
      action: match ? match[2] : null
    }
  }
}


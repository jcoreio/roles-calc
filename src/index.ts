type RoleModifier<Role extends string> = {
  extends: (...childRoles: Array<Roles<Role>>) => void
}
export type RolesObject<Role extends string> = Partial<
  Record<Role, boolean | undefined>
>

export type Roles<Role extends string> =
  | Role
  | Role[]
  | Set<Role>
  | RolesObject<Role>

export function* rolesToIterable<Role extends string>(
  ...args: Array<Roles<Role>>
): Iterable<Role> {
  if (!args.length) throw new Error('at least one argument must be provided')

  for (const roles of args) {
    if (roles instanceof Set || Array.isArray(roles)) yield* roles
    else if (typeof roles === 'string') yield roles
    else if (typeof roles === 'object' && roles != null) {
      const finalRoles = roles

      for (const key in finalRoles) {
        const role: Role = key as any
        if (
          Object.prototype.hasOwnProperty.call(finalRoles, role) &&
          finalRoles[role]
        )
          yield role
      }
    } else {
      throw new Error(`invalid argument: ${String(roles)}`)
    }
  }
}
export function rolesToSet<Role extends string>(
  ...args: Array<Roles<Role>>
): Set<Role> {
  if (args.length === 1 && args[0] instanceof Set) return args[0]
  return new Set(rolesToIterable(...args))
}
export function rolesToArray<Role extends string>(
  ...args: Array<Roles<Role>>
): ReadonlyArray<Role> {
  if (args.length === 1 && Array.isArray(args[0])) return args[0]
  return [...rolesToIterable(...args)]
}
export function rolesToObject<Role extends string>(
  ...args: Array<Roles<Role>>
): RolesObject<Role> {
  if (
    args.length === 1 &&
    !Array.isArray(args[0]) &&
    !(args[0] instanceof Set) &&
    typeof args[0] === 'object' &&
    args[0] != null
  ) {
    return args[0]
  }

  const result: Record<string, any> = {}

  for (const role of rolesToIterable(...args)) {
    result[role] = true
  }

  return result
}
export const INHERITANCE_DEPTH_LIMIT = 20

export default class RolesCalc<Role extends string> {
  _resourceActions: boolean // defaults to false

  _writeExtendsRead: boolean // defaults to false

  _resourceActionRegex: RegExp
  _resourceActionSeparator: string
  _alwaysAllow: Set<Role>
  /** relationships, as defined by the user */

  _childRolesToParentRoles: Map<Role, Set<Role>> = new Map()
  _childRolesToParentRolesFlattened: Map<Role, Set<Role>> = new Map()
  static rolesToSet: <Role extends string>(
    ...args: Array<Roles<Role>>
  ) => Set<Role> = rolesToSet
  static rolesToArray: <Role extends string>(
    ...args: Array<Roles<Role>>
  ) => ReadonlyArray<Role> = rolesToArray
  static rolesToObject: <Role extends string>(
    ...args: Array<Roles<Role>>
  ) => RolesObject<Role> = rolesToObject
  static rolesToIterable: <Role extends string>(
    ...args: Array<Roles<Role>>
  ) => Iterable<Role> = rolesToIterable

  constructor(
    opts: {
      alwaysAllow?: Roles<Role> | null | undefined
      resourceActions?: boolean | null | undefined
      writeExtendsRead?: boolean | null | undefined
      resourceActionSeparator?: string | null | undefined
    } = {}
  ) {
    const {
      alwaysAllow,
      resourceActions,
      writeExtendsRead,
      resourceActionSeparator,
    } = opts
    if (
      resourceActionSeparator != null &&
      resourceActionSeparator.length !== 1
    ) {
      throw new Error('resourceActionSeparator must be a single character')
    }
    this._alwaysAllow = rolesToSet(alwaysAllow || [])
    this._resourceActions = !!resourceActions
    this._writeExtendsRead = !!writeExtendsRead
    const sep = (this._resourceActionSeparator = resourceActionSeparator || ':')
    this._resourceActionRegex = new RegExp(`^([^${sep}]+)${sep}([^${sep}]+)$`)
  }

  role(parentRoles: Roles<Role>): RoleModifier<Role> {
    return {
      extends: (...childRoles: Array<Roles<Role>>) => {
        for (const parentRole of rolesToIterable(parentRoles)) {
          for (const arg of childRoles) {
            for (const childRole of rolesToIterable(arg)) {
              let parentRolesForChildRole: Set<Role> | null | undefined =
                this._childRolesToParentRoles.get(childRole)

              if (!parentRolesForChildRole) {
                parentRolesForChildRole = new Set()
                this._childRolesToParentRoles.set(
                  childRole,
                  parentRolesForChildRole
                )
              }

              if (!parentRolesForChildRole.has(parentRole)) {
                parentRolesForChildRole.add(parentRole)
                this._childRolesToParentRolesFlattened.clear()
              }
            }
          }
        }
      },
    }
  }

  isAuthorized(args: { required: Roles<Role>; actual: Roles<Role> }): boolean {
    const { required, actual } = args
    if (typeof required !== 'string') {
      for (const role of rolesToIterable(required)) {
        if (!this._isAuthorized({ required: role, actual })) return false
      }
      return true
    }
    return this._isAuthorized({ required, actual })
  }

  _isAuthorized(args: { required: Role; actual: Roles<Role> }): boolean {
    const { required, actual } = args // Look up a flattened set of roles that extend the required role

    const parentRoles: Set<Role> = this._getParentRolesSet(required)

    for (const actualRole of rolesToIterable(actual)) {
      if (actualRole === required || parentRoles.has(actualRole)) return true
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
    for (const childRole of pruned) {
      for (const parentRole of this.getParentRolesSet(childRole)) {
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
    let parentRoles: Set<Role> | null | undefined =
      this._childRolesToParentRolesFlattened.get(role)

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
    const { action } = this._toResourceAndAction(role)

    const roles: Set<Role> = new Set(this._alwaysAllow)
    roles.add(role)
    let addedRoles: Set<Role> = new Set(roles)
    let sanityCount = INHERITANCE_DEPTH_LIMIT + 1

    while (addedRoles.size) {
      if (!sanityCount--)
        throw new Error(
          `could not flatten roles: inheritance depth of ${INHERITANCE_DEPTH_LIMIT} levels was exceeded`
        )
      const addedRolesThisPass: Set<Role> = new Set()

      for (const addedRole of addedRoles) {
        const addIfNotPresent = (role: any) => {
          if (!roles.has(role)) {
            addedRolesThisPass.add(role)
            roles.add(role)
          }
        } // process 'resource:write' > 'resource:read' and 'resource' > 'resource:action' inheritances

        this._explodeResourceActionRole(addedRole).forEach(addIfNotPresent) // process inheritance links added by calls to rc.role('foo').extends('bar')

        const userConfiguredParentRoles: Set<Role> | null | undefined =
          this._childRolesToParentRoles.get(addedRole)

        if (userConfiguredParentRoles) {
          userConfiguredParentRoles.forEach((parentRole: Role) => {
            addIfNotPresent(parentRole)
            if (action && !this._toResourceAndAction(parentRole).action) {
              // This is a parent > child relationship, and we're looking for a child:action
              // permission. In this case, parent:action > child:action
              addIfNotPresent(
                `${parentRole}${this._resourceActionSeparator}${action}`
              )
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

    const { resource, action } = this._toResourceAndAction(role)

    if (resource && action) {
      result.add(resource as any)
      if (this._writeExtendsRead && 'read' === (action as any))
        result.add(`${resource}${this._resourceActionSeparator}write` as any)
    }

    return result
  }

  _toResourceAndAction(role: Role): {
    resource: Role | null | undefined
    action: Role | null | undefined
  } {
    const match = this._resourceActions
      ? role.match(this._resourceActionRegex)
      : null
    return {
      resource: match ? (match[1] as any) : null,
      action: match ? (match[2] as any) : null,
    }
  }
}

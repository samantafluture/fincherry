import { createContext, useContext } from 'react';

export type Role = 'admin' | 'partner';

export const RoleContext = createContext<Role>('admin');

export function useRole(): Role {
  return useContext(RoleContext);
}

export function useIsAdmin(): boolean {
  return useContext(RoleContext) === 'admin';
}

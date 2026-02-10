import { useStorageState } from './useStorageState';
import { STORAGE_KEYS } from '../../storage/storage-keys';
import type { ProblemData, SubmissionData } from '../../types/storage.types';
import type { UserStatus } from '../../types/models';

/**
 * Hook for accessing problem data from storage
 */
export function useProblemData(): [ProblemData | undefined, boolean] {
  return useStorageState(STORAGE_KEYS.problems);
}

/**
 * Hook for accessing submission data from storage
 */
export function useSubmissionData(): [SubmissionData | undefined, boolean] {
  return useStorageState(STORAGE_KEYS.submissions);
}

/**
 * Hook for accessing user data from storage
 */
export function useUserData(): [UserStatus | undefined, boolean] {
  return useStorageState(STORAGE_KEYS.userData);
}

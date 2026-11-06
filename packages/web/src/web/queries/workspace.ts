import { useQuery,useMutation,useQueryClient } from '@tanstack/react-query';
import { orpc } from '../lib/api';
export function useWorkspace(enabled:boolean){return useQuery(orpc.workspace.overview.queryOptions({enabled,retry:false}));}
export function usePreview(){return useQuery(orpc.workspace.preview.queryOptions());}
export function useProduct(id:string){return useQuery(orpc.workspace.product.queryOptions({input:{id},enabled:!!id,retry:false}));}
export function useReview(id:string){return useQuery(orpc.review.get.queryOptions({input:{id},enabled:!!id,retry:false}));}
export function useApproved(){return useQuery(orpc.review.approved.queryOptions());}
export function usePacket(id:string){return useQuery(orpc.production.packet.queryOptions({input:{id},enabled:!!id}));}
export function usePrompts(enabled=true){return useQuery(orpc.production.list.queryOptions({enabled}));}
export function useSources(){return useQuery(orpc.workspace.sources.queryOptions());}
export function useAction<TInput,TResult>(fn:(input:TInput)=>Promise<TResult>){const q=useQueryClient();return useMutation({mutationFn:fn,onSuccess:()=>q.invalidateQueries()});}
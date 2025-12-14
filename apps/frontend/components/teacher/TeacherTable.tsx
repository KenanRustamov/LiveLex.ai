"use client";

import {
    useReactTable,
    getCoreRowModel,
    getSortedRowModel,
    flexRender,
    SortingState,
    ColumnDef,
} from "@tanstack/react-table";
import { useState } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";

interface TeacherTableProps<T> {
    data: T[];
    columns: ColumnDef<T, any>[];
    onRowClick?: (row: T) => void;
    emptyMessage?: string;
}

export function TeacherTable<T>({
    data,
    columns,
    onRowClick,
    emptyMessage = "No data available."
}: TeacherTableProps<T>) {
    const [sorting, setSorting] = useState<SortingState>([]);

    const table = useReactTable({
        data,
        columns,
        getCoreRowModel: getCoreRowModel(),
        onSortingChange: setSorting,
        getSortedRowModel: getSortedRowModel(),
        state: {
            sorting,
        },
    });

    return (
        <div className="rounded-xl border border-gray-100 overflow-hidden bg-white">
            <Table>
                <TableHeader className="bg-gray-50/50">
                    {table.getHeaderGroups().map(headerGroup => (
                        <TableRow key={headerGroup.id} className="hover:bg-transparent">
                            {headerGroup.headers.map(header => (
                                <TableHead key={header.id} className="cursor-pointer select-none" onClick={header.column.getToggleSortingHandler()}>
                                    <div className="flex items-center gap-1 hover:text-foreground transition-colors">
                                        {flexRender(header.column.columnDef.header, header.getContext())}
                                        {{
                                            asc: <ChevronUp size={14} />,
                                            desc: <ChevronDown size={14} />,
                                        }[header.column.getIsSorted() as string] ?? (
                                                header.column.getCanSort() ? <ChevronsUpDown size={14} className="text-gray-300" /> : null
                                            )}
                                    </div>
                                </TableHead>
                            ))}
                        </TableRow>
                    ))}
                </TableHeader>
                <TableBody>
                    {table.getRowModel().rows.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                                {emptyMessage}
                            </TableCell>
                        </TableRow>
                    ) : (
                        table.getRowModel().rows.map(row => (
                            <TableRow
                                key={row.id}
                                className={onRowClick ? "cursor-pointer hover:bg-gray-50" : ""}
                                onClick={() => onRowClick && onRowClick(row.original)}
                            >
                                {row.getVisibleCells().map(cell => (
                                    <TableCell key={cell.id}>
                                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                    </TableCell>
                                ))}
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>
        </div>
    );
}

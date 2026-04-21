'use client';

import * as React from 'react';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface CategoryComboboxProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function CategoryCombobox({
  value,
  onChange,
  placeholder = "Select category...",
}: CategoryComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [categories, setCategories] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [searchValue, setSearchValue] = React.useState("");

  const fetchCategories = React.useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/products/categories');
      if (response.ok) {
        const data = await response.json();
        setCategories(data.categories || []);
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (open) {
      fetchCategories();
    }
  }, [open, fetchCategories]);

  const handleSelect = (currentValue: string) => {
    onChange(currentValue === value ? "" : currentValue);
    setOpen(false);
  };

  const handleCreateNew = () => {
    if (searchValue) {
      onChange(searchValue);
      setOpen(false);
    }
  };

  // Filter categories based on search value manually to show "Create new" accurately
  const filteredCategories = categories.filter((category) =>
    category.toLowerCase().includes(searchValue.toLowerCase())
  );

  const exactMatch = categories.some(
    (category) => category.toLowerCase() === searchValue.toLowerCase()
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between bg-zinc-900/50 border-white/10 text-white h-11 hover:bg-zinc-800 hover:text-white"
        >
          {value || placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0 bg-zinc-900 border-white/10">
        <Command className="bg-transparent" shouldFilter={false}>
          <CommandInput 
            placeholder="Search category..." 
            className="text-white" 
            value={searchValue}
            onValueChange={setSearchValue}
          />
          <CommandList>
            {loading && filteredCategories.length === 0 && (
              <div className="p-4 text-sm text-zinc-500 text-center">Loading categories...</div>
            )}
            
            <CommandGroup>
              {filteredCategories.map((category) => (
                <CommandItem
                  key={category}
                  value={category}
                  onSelect={() => handleSelect(category)}
                  className="text-white hover:bg-white/10 cursor-pointer"
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === category ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {category}
                </CommandItem>
              ))}
            </CommandGroup>

            {searchValue && !exactMatch && (
              <CommandGroup>
                <CommandItem
                  value={searchValue}
                  onSelect={handleCreateNew}
                  className="text-primary hover:bg-primary/10 cursor-pointer font-medium"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create "{searchValue}"
                </CommandItem>
              </CommandGroup>
            )}

            {!loading && filteredCategories.length === 0 && !searchValue && (
              <div className="p-4 text-sm text-zinc-500 text-center">No categories found. Start typing to create one.</div>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

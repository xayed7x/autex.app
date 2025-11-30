# 🎨 Autex Design System - v0 Specification

**For:** Dashboard UI Development  
**Date:** 2025-11-29  
**Framework:** Next.js 15 + Tailwind CSS + shadcn/ui

---

## 📋 Quick Reference

### Primary Colors
- **Primary:** `oklch(0.21 0.034 264.665)` - Deep navy blue
- **Primary Foreground:** `oklch(0.985 0.002 247.839)` - Off-white
- **Background:** `oklch(1 0 0)` - Pure white
- **Foreground:** `oklch(0.13 0.028 261.692)` - Very dark blue

### Fonts
- **Sans:** Geist Sans (Google Font)
- **Mono:** Geist Mono (Google Font)

### Border Radius
- **Base:** `0.625rem` (10px)
- **Small:** `0.375rem` (6px)
- **Medium:** `0.5rem` (8px)
- **Large:** `0.625rem` (10px)
- **Extra Large:** `0.875rem` (14px)

---

## 🎨 Complete Color Palette

### Light Mode (Default)

#### Background Colors
```css
--background: oklch(1 0 0)                    /* Pure white */
--foreground: oklch(0.13 0.028 261.692)       /* Very dark blue */
--card: oklch(1 0 0)                          /* White */
--card-foreground: oklch(0.13 0.028 261.692)  /* Very dark blue */
--popover: oklch(1 0 0)                       /* White */
--popover-foreground: oklch(0.13 0.028 261.692) /* Very dark blue */
```

#### Brand Colors
```css
--primary: oklch(0.21 0.034 264.665)          /* Deep navy blue */
--primary-foreground: oklch(0.985 0.002 247.839) /* Off-white */
--secondary: oklch(0.967 0.003 264.542)       /* Very light blue-gray */
--secondary-foreground: oklch(0.21 0.034 264.665) /* Deep navy blue */
```

#### Utility Colors
```css
--muted: oklch(0.967 0.003 264.542)           /* Very light blue-gray */
--muted-foreground: oklch(0.551 0.027 264.364) /* Medium blue-gray */
--accent: oklch(0.967 0.003 264.542)          /* Very light blue-gray */
--accent-foreground: oklch(0.21 0.034 264.665) /* Deep navy blue */
--destructive: oklch(0.577 0.245 27.325)      /* Red */
```

#### Border & Input
```css
--border: oklch(0.928 0.006 264.531)          /* Light gray-blue */
--input: oklch(0.928 0.006 264.531)           /* Light gray-blue */
--ring: oklch(0.707 0.022 261.325)            /* Medium blue-gray */
```

#### Chart Colors
```css
--chart-1: oklch(0.646 0.222 41.116)          /* Orange */
--chart-2: oklch(0.6 0.118 184.704)           /* Cyan */
--chart-3: oklch(0.398 0.07 227.392)          /* Blue */
--chart-4: oklch(0.828 0.189 84.429)          /* Yellow-green */
--chart-5: oklch(0.769 0.188 70.08)           /* Yellow */
```

#### Sidebar Colors
```css
--sidebar: oklch(0.985 0.002 247.839)         /* Off-white */
--sidebar-foreground: oklch(0.13 0.028 261.692) /* Very dark blue */
--sidebar-primary: oklch(0.21 0.034 264.665)  /* Deep navy blue */
--sidebar-primary-foreground: oklch(0.985 0.002 247.839) /* Off-white */
--sidebar-accent: oklch(0.967 0.003 264.542)  /* Very light blue-gray */
--sidebar-accent-foreground: oklch(0.21 0.034 264.665) /* Deep navy blue */
--sidebar-border: oklch(0.928 0.006 264.531)  /* Light gray-blue */
--sidebar-ring: oklch(0.707 0.022 261.325)    /* Medium blue-gray */
```

---

### Dark Mode

#### Background Colors
```css
--background: oklch(0.13 0.028 261.692)       /* Very dark blue */
--foreground: oklch(0.985 0.002 247.839)      /* Off-white */
--card: oklch(0.21 0.034 264.665)             /* Deep navy blue */
--card-foreground: oklch(0.985 0.002 247.839) /* Off-white */
--popover: oklch(0.21 0.034 264.665)          /* Deep navy blue */
--popover-foreground: oklch(0.985 0.002 247.839) /* Off-white */
```

#### Brand Colors
```css
--primary: oklch(0.928 0.006 264.531)         /* Light gray-blue */
--primary-foreground: oklch(0.21 0.034 264.665) /* Deep navy blue */
--secondary: oklch(0.278 0.033 256.848)       /* Dark blue-gray */
--secondary-foreground: oklch(0.985 0.002 247.839) /* Off-white */
```

#### Utility Colors
```css
--muted: oklch(0.278 0.033 256.848)           /* Dark blue-gray */
--muted-foreground: oklch(0.707 0.022 261.325) /* Medium blue-gray */
--accent: oklch(0.278 0.033 256.848)          /* Dark blue-gray */
--accent-foreground: oklch(0.985 0.002 247.839) /* Off-white */
--destructive: oklch(0.704 0.191 22.216)      /* Bright red */
```

#### Border & Input
```css
--border: oklch(1 0 0 / 10%)                  /* White 10% opacity */
--input: oklch(1 0 0 / 15%)                   /* White 15% opacity */
--ring: oklch(0.551 0.027 264.364)            /* Medium blue-gray */
```

#### Chart Colors (Dark)
```css
--chart-1: oklch(0.488 0.243 264.376)         /* Purple */
--chart-2: oklch(0.696 0.17 162.48)           /* Green */
--chart-3: oklch(0.769 0.188 70.08)           /* Yellow */
--chart-4: oklch(0.627 0.265 303.9)           /* Pink */
--chart-5: oklch(0.645 0.246 16.439)          /* Orange */
```

#### Sidebar Colors (Dark)
```css
--sidebar: oklch(0.21 0.034 264.665)          /* Deep navy blue */
--sidebar-foreground: oklch(0.985 0.002 247.839) /* Off-white */
--sidebar-primary: oklch(0.488 0.243 264.376) /* Purple */
--sidebar-primary-foreground: oklch(0.985 0.002 247.839) /* Off-white */
--sidebar-accent: oklch(0.278 0.033 256.848)  /* Dark blue-gray */
--sidebar-accent-foreground: oklch(0.985 0.002 247.839) /* Off-white */
--sidebar-border: oklch(1 0 0 / 10%)          /* White 10% opacity */
--sidebar-ring: oklch(0.551 0.027 264.364)    /* Medium blue-gray */
```

---

## 🔤 Typography

### Font Families
```typescript
// Import in layout.tsx
import { Geist, Geist_Mono } from "next/font/google";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});
```

### Font Usage
- **Body Text:** `font-sans` (Geist Sans)
- **Headings:** `font-sans` (Geist Sans)
- **Code/Numbers:** `font-mono` (Geist Mono)
- **Monospace:** `font-mono` (Geist Mono)

### Font Sizes (Recommended)
```css
text-xs     /* 0.75rem - 12px */
text-sm     /* 0.875rem - 14px */
text-base   /* 1rem - 16px */
text-lg     /* 1.125rem - 18px */
text-xl     /* 1.25rem - 20px */
text-2xl    /* 1.5rem - 24px */
text-3xl    /* 1.875rem - 30px */
text-4xl    /* 2.25rem - 36px */
```

---

## 📐 Spacing & Layout

### Border Radius
```css
rounded-sm   /* 0.375rem - 6px */
rounded-md   /* 0.5rem - 8px */
rounded-lg   /* 0.625rem - 10px (base) */
rounded-xl   /* 0.875rem - 14px */
rounded-2xl  /* 1rem - 16px */
rounded-full /* 9999px */
```

### Shadows (Recommended)
```css
shadow-sm    /* Subtle shadow for cards */
shadow-md    /* Medium shadow for elevated elements */
shadow-lg    /* Large shadow for modals/popovers */
```

### Spacing Scale
```css
p-1  /* 0.25rem - 4px */
p-2  /* 0.5rem - 8px */
p-3  /* 0.75rem - 12px */
p-4  /* 1rem - 16px */
p-6  /* 1.5rem - 24px */
p-8  /* 2rem - 32px */
p-12 /* 3rem - 48px */
```

---

## 🎯 Component Guidelines for v0

### Cards
```tsx
<Card className="border-border bg-card text-card-foreground">
  <CardHeader>
    <CardTitle>Title</CardTitle>
    <CardDescription>Description</CardDescription>
  </CardHeader>
  <CardContent>
    {/* Content */}
  </CardContent>
</Card>
```

### Buttons
```tsx
// Primary
<Button variant="default">Primary Action</Button>

// Secondary
<Button variant="secondary">Secondary Action</Button>

// Destructive
<Button variant="destructive">Delete</Button>

// Ghost
<Button variant="ghost">Ghost</Button>

// Outline
<Button variant="outline">Outline</Button>
```

### Sidebar
```tsx
<Sidebar className="bg-sidebar text-sidebar-foreground border-sidebar-border">
  <SidebarHeader />
  <SidebarContent>
    <SidebarGroup>
      <SidebarGroupLabel>Navigation</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton>
              Item
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  </SidebarContent>
</Sidebar>
```

### Tables
```tsx
<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Header</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    <TableRow>
      <TableCell>Cell</TableCell>
    </TableRow>
  </TableBody>
</Table>
```

### Badges
```tsx
<Badge variant="default">Default</Badge>
<Badge variant="secondary">Secondary</Badge>
<Badge variant="destructive">Destructive</Badge>
<Badge variant="outline">Outline</Badge>
```

---

## 🎨 Color Usage Guidelines

### When to Use Each Color

**Primary (Deep Navy Blue)**
- Main CTAs (Call-to-Action buttons)
- Active navigation items
- Important headings
- Links

**Secondary (Light Blue-Gray)**
- Secondary buttons
- Hover states
- Background highlights
- Less important actions

**Muted (Very Light Blue-Gray)**
- Disabled states
- Placeholder text
- Subtle backgrounds
- Secondary information

**Destructive (Red)**
- Delete buttons
- Error messages
- Warning states
- Critical actions

**Chart Colors**
- Use for data visualization
- Graphs and charts
- Statistics displays
- Analytics dashboards

---

## 📱 Responsive Design

### Breakpoints (Tailwind Default)
```css
sm: 640px   /* Small devices */
md: 768px   /* Medium devices */
lg: 1024px  /* Large devices */
xl: 1280px  /* Extra large devices */
2xl: 1536px /* 2X Extra large devices */
```

### Mobile-First Approach
```tsx
// Stack on mobile, grid on desktop
<div className="flex flex-col md:grid md:grid-cols-2 lg:grid-cols-3 gap-4">
  {/* Content */}
</div>
```

---

## 🌓 Dark Mode Support

### Implementation
```tsx
// Automatically supported via .dark class
// No additional code needed in components
// Use semantic color tokens (bg-background, text-foreground, etc.)
```

### Testing Dark Mode
```tsx
// Add to root element
<html className="dark">
  {/* Dark mode active */}
</html>
```

---

## ✨ Special Effects

### Animations
```css
/* Available via tw-animate-css */
animate-fade-in
animate-slide-in
animate-bounce
animate-pulse
```

### Transitions
```css
transition-colors  /* For color changes */
transition-all     /* For all properties */
duration-200       /* 200ms */
duration-300       /* 300ms */
```

### Hover Effects
```tsx
<Button className="hover:bg-primary/90 transition-colors">
  Hover Me
</Button>
```

---

## 📊 Dashboard-Specific Guidelines

### Stat Cards
```tsx
<Card>
  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
    <CardTitle className="text-sm font-medium">
      Total Orders
    </CardTitle>
    <Icon className="h-4 w-4 text-muted-foreground" />
  </CardHeader>
  <CardContent>
    <div className="text-2xl font-bold">1,234</div>
    <p className="text-xs text-muted-foreground">
      +20.1% from last month
    </p>
  </CardContent>
</Card>
```

### Data Tables
- Use `border-border` for borders
- Use `bg-muted/50` for header backgrounds
- Use `hover:bg-muted/50` for row hover states
- Use `text-sm` for table text

### Navigation
- Active state: `bg-sidebar-accent text-sidebar-accent-foreground`
- Hover state: `hover:bg-sidebar-accent/50`
- Icon color: `text-sidebar-foreground/70`

---

## 🎯 v0 Prompt Template

When requesting UI from v0, use this format:

```
Create a [component name] for a Next.js 15 dashboard using shadcn/ui.

Design System:
- Primary color: oklch(0.21 0.034 264.665) (deep navy blue)
- Background: oklch(1 0 0) (white)
- Font: Geist Sans
- Border radius: 0.625rem
- Use semantic color tokens (bg-background, text-foreground, etc.)
- Support dark mode via .dark class

Requirements:
[Your specific requirements]

Style:
- Clean, modern design
- Use Card components with subtle shadows
- Responsive (mobile-first)
- Consistent spacing (p-4, p-6, gap-4)
```

---

## 📦 Available shadcn/ui Components

✅ Already Installed:
- Button
- Card
- Badge
- Table
- Form
- Input
- Select
- Dialog
- Dropdown Menu
- Sidebar
- Sonner (Toast notifications)

---

## 🎨 Example Color Combinations

### Light Mode
- **Background:** `bg-background` (white)
- **Text:** `text-foreground` (dark blue)
- **Cards:** `bg-card border-border` (white with light border)
- **Primary Button:** `bg-primary text-primary-foreground` (navy blue with white text)
- **Hover:** `hover:bg-primary/90` (slightly lighter navy)

### Dark Mode
- **Background:** `bg-background` (dark blue)
- **Text:** `text-foreground` (off-white)
- **Cards:** `bg-card border-border` (navy with subtle border)
- **Primary Button:** `bg-primary text-primary-foreground` (light gray with dark text)
- **Hover:** `hover:bg-primary/90` (slightly darker gray)

---

**This design system ensures consistency across all dashboard components while maintaining flexibility for custom designs.**

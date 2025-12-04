// Clean updateService method without verbose logging
export async updateService(serviceId: string, serviceData: Partial<Service>): Promise<Service> {
  const response = await this.makeAuthenticatedRequest(`/v1/services/${encodeURIComponent(serviceId)}`, {
    method: 'PUT',
    body: JSON.stringify(serviceData)
  });
  
  if (!response.ok) {
    let errorMessage = `Failed to update service: ${response.status} ${response.statusText}`;
    
    try {
      const errorResponse = await response.text();
      
      // Try to parse structured error response
      if (errorResponse) {
        try {
          const errorData = JSON.parse(errorResponse);
          
          if (errorData.errors && Array.isArray(errorData.errors) && errorData.errors.length > 0) {
            const firstError = errorData.errors[0];
            errorMessage = firstError.errorMessage || errorMessage;
          }
        } catch (parseError) {
          // If parsing fails, use the original error message
        }
      }
    } catch (textError) {
      // If reading response text fails, use the original error message
    }
    
    throw new Error(errorMessage);
  }
  
  return await response.json();
}

// Also clean getServiceStations method if it doesn't exist
export async getServiceStations(serviceId: string): Promise<any[]> {
  try {
    const response = await this.makeAuthenticatedRequest(`/v1/services/${encodeURIComponent(serviceId)}/stations`);
    if (!response.ok) {
      // Return empty array for graceful fallback
      return [];
    }
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    // Suppress service stations errors - this is expected to fail for many services
    return [];
  }
}

// Also need to add deleteService method if it doesn't exist
export async deleteService(serviceId: string): Promise<void> {
  const response = await this.makeAuthenticatedRequest(`/v1/services/${encodeURIComponent(serviceId)}`, {
    method: 'DELETE'
  });
  
  if (!response.ok) {
    throw new Error(`Failed to delete service: ${response.status} ${response.statusText}`);
  }
}
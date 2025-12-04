// This is just the save section that should be added at the end of NetworkEditDetail.tsx
// Replace the end of the Tabs component with this section

      </Tabs>

      {/* Save Section */}
      <div className="border-t pt-6 mt-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">
              Changes are saved automatically using progressive enhancement
            </p>
            {error && (
              <p className="text-sm text-destructive">
                Last update failed: {error.split('.')[0]}
              </p>
            )}
          </div>
          
          <div className="flex items-center space-x-3">
            <Button
              variant="outline"
              onClick={loadNetworkData}
              disabled={saving || loading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Reload
            </Button>
            
            <Button
              onClick={handleSave}
              disabled={saving || loading}
              className="min-w-[120px]"
            >
              {saving ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Debug Information Panel (only show in development) */}
        {process.env.NODE_ENV === 'development' && (
          <div className="mt-4 p-4 bg-muted rounded-lg">
            <h4 className="text-sm font-medium mb-2">Debug Information</h4>
            <div className="text-xs text-muted-foreground space-y-1">
              <p><strong>Service ID:</strong> {serviceId}</p>
              <p><strong>Form State:</strong> {Object.keys(formData).length} fields loaded</p>
              <p><strong>Original Service Fields:</strong> {service ? Object.keys(service).length : 0} fields</p>
              <p><strong>API Endpoint:</strong> PUT /v1/services/{serviceId}</p>
              <p><strong>Status:</strong> {saving ? 'Saving...' : error ? 'Error' : 'Ready'}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}